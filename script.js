// Theme toggle
const themeToggle = document.getElementById('theme-toggle');
const htmlElement = document.documentElement;

themeToggle.addEventListener('click', () => {
  htmlElement.classList.toggle('dark');
  localStorage.setItem('theme', htmlElement.classList.contains('dark') ? 'dark' : 'light');
});

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    htmlElement.classList.remove('dark');
  }
  
  // Initialize EmailJS with your public key
  emailjs.init('ATlJunWlfoUMFBJJy');

  // Set up contact form submission with EmailJS
  const contactForm = document.getElementById('contact-form');
  contactForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    emailjs.sendForm('service_7et6vtg', 'template_8u2onnm', this)
      .then(() => {
        alert('Message sent successfully!');
        this.reset();
      })
      .catch((err) => {
        console.error('EmailJS Error:', err);
        alert('An error occurred while sending the message. Please try again later.');
      });
  });
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Sticky header behavior
const header = document.querySelector('.header');
let lastScroll = 0;
window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;
  if (currentScroll <= 0) {
    header.classList.remove('scrolled');
    return;
  }
  if (currentScroll > lastScroll && !header.classList.contains('scroll-down')) {
    header.classList.remove('scroll-up');
    header.classList.add('scroll-down');
  } else if (currentScroll < lastScroll && header.classList.contains('scroll-down')) {
    header.classList.remove('scroll-down');
    header.classList.add('scroll-up');
  }
  lastScroll = currentScroll;
});
