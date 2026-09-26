const pages = document.querySelectorAll(".page");
const navItems = document.querySelectorAll(".nav-item");
const toast = document.getElementById("toast");

function showPage(name){
  pages.forEach(page => page.classList.toggle("active", page.dataset.page === name));
  navItems.forEach(item => item.classList.toggle("active", item.dataset.nav === name));
  window.scrollTo({top:0, behavior:"smooth"});
}

navItems.forEach(item => item.addEventListener("click", () => showPage(item.dataset.nav)));

function notify(message){
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

document.querySelectorAll("[data-action]").forEach(button => {
  button.addEventListener("click", async () => {
    const action = button.dataset.action;
    if(action === "deposit") notify("Deposit page will be connected later.");
    if(action === "withdraw") notify("Withdrawal page will be connected later.");
    if(action === "gift") notify("Gift-code redemption will be connected later.");
    if(action === "invite") showPage("team");
    if(action === "invest") notify("Product details and investment flow will be connected later.");
    if(action === "copy"){
      const link = window.location.origin + "/?ref=NOVA-123456";
      try {
        await navigator.clipboard.writeText(link);
        notify("Referral link copied.");
      } catch {
        notify("Referral link: " + link);
      }
    }
  });
});
