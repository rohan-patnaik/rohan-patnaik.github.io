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

// Hamburger & Sidebar
const hamburgerBtn = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');
const closeSidebarBtn = document.getElementById('close-sidebar');

// Open sidebar
hamburgerBtn.addEventListener('click', () => {
  sidebar.classList.add('open');
});

// Close sidebar when clicking "×"
closeSidebarBtn.addEventListener('click', () => {
  sidebar.classList.remove('open');
});

// Close sidebar after clicking a link
document.querySelectorAll('.sidebar-links a').forEach(link => {
  link.addEventListener('click', () => {
    sidebar.classList.remove('open');
  });
});
