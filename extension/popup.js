chrome.storage.local.get(["saved"], (d) => {
  document.getElementById("saved").textContent = "$" + (d.saved || 0);
});
