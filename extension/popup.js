// The pond lives in the brain; chrome.storage is the offline mirror.
fetch("http://localhost:8000/pond")
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .catch(() => new Promise((res) => chrome.storage.local.get(["saved"], (d) => res({ saved: d.saved || 0 }))))
  .then((pond) => {
    document.getElementById("saved").textContent = "$" + pond.saved;
    // Same $800 pond scale as the duck card and dashboard.
    document.getElementById("fill").style.width = Math.min(100, (pond.saved / 800) * 100) + "%";
    if (pond.skips != null) {
      document.querySelector(".lbl").textContent = `saved across ${pond.skips} skipped buys`;
    }
  });
