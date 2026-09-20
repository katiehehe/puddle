// The pond lives in the brain; chrome.storage is the offline mirror.
fetch("http://localhost:8000/pond")
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .catch(() => new Promise((res) => chrome.storage.local.get(["saved"], (d) => res({ saved: d.saved || 0 }))))
  .then((pond) => {
    document.getElementById("saved").textContent = "$" + pond.saved;
    if (pond.skips != null) {
      document.querySelector(".lbl").textContent = `saved across ${pond.skips} skipped buys`;
    }
  });
