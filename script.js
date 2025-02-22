// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    const targetElement = document.querySelector(this.getAttribute("href"));
    if (targetElement) {
      window.scrollTo({
        top: targetElement.offsetTop - 70, // Offset for fixed header
        behavior: "smooth",
      });
    }
  });
});
