// ==UserScript==
// @name        Download documents from postbox - ing.de
// @namespace   https://github.com/ja-ka/violentmonkey
// @match       https://banking.ing.de/app/postbox/postbox
// @match       https://banking.ing.de/app/postbox/postbox_archiv
// @grant       GM_download
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.min.js
// @require     https://cdn.jsdelivr.net/combine/npm/@violentmonkey/dom@1,npm/@violentmonkey/ui@0.5
// @version     1.5
// @author      Jascha Kanngießer
// @description Places a button "Alle herunterladen" next to "Alle archivieren" and downloads all documents visible on the page.
// @icon        https://www.ing.de/favicon-32x32.png
// @run-at      document-end
// @downloadURL https://raw.githubusercontent.com/ja-ka/violentmonkey/master/ing-postbox-download-all.js
// @supportURL  https://github.com/ja-ka/violentmonkey
// @homepageURL https://github.com/ja-ka/violentmonkey
// ==/UserScript==

(function () {
  $(document).ready(function () {
    const NAME = "Alle herunterladen";    

    const download = async (url, name) => new Promise((res, rej) => {
      const performDownload = () => {
        GM_download({ url, name: name || 'document.pdf', onprogress: (progress) => {
          if (progress.status === 200) {
            setTimeout(() => {
              res();
            }, 200);
          }
        }, onerror: rej , onabort: rej, ontimeout: rej });
      };

      // Wenn kein Name vorgegeben, versuche den Originalnamen vom Server zu holen
      if (!name) {
        fetch(url, { method: 'HEAD' })
          .then(response => {
            const disposition = response.headers.get('content-disposition');
            if (disposition) {
              // Versuche verschiedene Formate zu matchen
              let filenameMatch = disposition.match(/filename\*=UTF-8''(.+?)(?:;|$)/);
              if (!filenameMatch) {
                filenameMatch = disposition.match(/filename=(?:"(.+?)"|([^;\s]+))/);
              }
              if (filenameMatch) {
                name = decodeURIComponent(filenameMatch[1] || filenameMatch[2]);
              }
            }
            performDownload();
          })
          .catch(() => performDownload());
      } else {
        performDownload();
      }
    });

    let abort = false;
    let loading = false;
    const FILENAME_TEMPLATE_KEY = "FILENAME_TEMPLATE";
    const RENAME_FILES_KEY = "RENAME_FILES";
    let filenameTemplate = GM_getValue(FILENAME_TEMPLATE_KEY, "YYYY.MM.DD_ART_BETREFF");
    let renameFiles = GM_getValue(RENAME_FILES_KEY, true);
    
    const addButton = (name, onClick) => {
      $('.account-filters').after(VM.createElement("button", {
        className: "content-header__button gap-left-1",
        style: {
          borderRadius: "6px",
          fontSize: "14px",
          fontSize: ".875rem",
          lineHeight: "20px",
          padding: "7px 14px 6px",
          margin: "0px",
          marginBottom: "25px",
          marginRight: "10px"
        },
        onClick
      }, name));  
    }
    
    addButton("Dateinamen ändern", async function(event) {
      event.preventDefault()
      const newFilenameTemplate = prompt("Bitte gib ein Dateiname-Template ein:", filenameTemplate);
      
      if (newFilenameTemplate === null) {
        return;
      }
      
      if (!['DD', 'MM', 'YYYY', 'ART', 'BETREFF'].every((curr) => {
        return newFilenameTemplate.includes(curr);
      })) {
        alert('Bitte gib ein Template nach folgendem Muster ein: YYYY.MM.DD_ART_BETREFF');
        return;
      }
      
      GM_setValue(FILENAME_TEMPLATE_KEY, newFilenameTemplate);
      filenameTemplate = newFilenameTemplate;
    });

    addButton(renameFiles ? "Umbenennung: AN" : "Umbenennung: AUS", async function(event) {
      event.preventDefault()
      renameFiles = !renameFiles;
      GM_setValue(RENAME_FILES_KEY, renameFiles);
      this.innerHTML = renameFiles ? "Umbenennung: AN" : "Umbenennung: AUS";
    });     
    
    addButton(NAME, async function(event) {
      event.preventDefault()
      if (loading) {
        abort = true;
        return;
      }

      loading = true;

      try {
        let downloaded = 0;
        const rows = $('.ibbr-table-body div.ibbr-table-row');

        const setProgress = () => {
          downloaded += 1;
          this.innerHTML = `${downloaded} / ${rows.length} verarbeitet (erneut klicken um abzubrechen)`;
        };

        const downloads = 
          rows
            .map(function() {
              const nameSegments = $(this).find('> span.ibbr-table-cell:not(:last)')
                .map(function() {
                  return $(this).text().trim().replace(/[^A-Za-z0-9ÄÖÜäöüß]/g, '_').replace('/\n/g', '');
                })
                .get();

              let name;
              if (renameFiles) {
                name = `${filenameTemplate
                  .replace('DD', nameSegments[2].split('_')[0])
                  .replace('MM', nameSegments[2].split('_')[1])
                  .replace('YYYY', nameSegments[2].split('_')[2])
                  .replace('ART', nameSegments[0])
                  .replace('BETREFF', nameSegments[1])}.pdf`;
              } else {
                // Kein Name setzen = Originalnamen vom Server verwenden
                name = null;
              }

              const url = "https://banking.ing.de/app/postbox" + $(this).find('a:contains(Download)').first().attr('href').substring(1);
              return { url, name };
            })
            .get();

        for (const d of downloads) {
          if (abort) {
            break;  
          }

          setProgress();
          await download(d.url, d.name);
        }
      } catch (err) {
        console.error("Download Error:", err);
        alert("Es ist ein Fehler aufgetreten: " + (err.message || err));
      }

      abort = false;
      loading = false;
      this.innerHTML = NAME;
    });    
  })
})();
