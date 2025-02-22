import React from 'react';
import { Github, Linkedin, Twitter, FileText, ExternalLink } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-sm shadow-sm z-50">
        <nav className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-blue-900">Rohan</h1>
          <div className="hidden md:flex space-x-6">
            <a href="#about" className="text-gray-600 hover:text-blue-600">About</a>
            <a href="#projects" className="text-gray-600 hover:text-blue-600">Projects</a>
            <a href="#articles" className="text-gray-600 hover:text-blue-600">Articles</a>
            <a href="#experience" className="text-gray-600 hover:text-blue-600">Experience</a>
          </div>
          <div className="flex items-center space-x-4">
            <a href="#" className="text-gray-600 hover:text-blue-600"><Github size={20} /></a>
            <a href="#" className="text-gray-600 hover:text-blue-600"><Linkedin size={20} /></a>
            <a href="#" className="text-gray-600 hover:text-blue-600"><Twitter size={20} /></a>
            <a href="#" className="hidden md:flex items-center space-x-1 bg-blue-500 text-white px-4 py-2 rounded-full hover:bg-blue-600 transition">
              <FileText size={16} />
              <span>Resume</span>
            </a>
          </div>
        </nav>
      </header>

      {/* Intro Section */}
      <section id="about" className="container mx-auto px-4 py-20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="flex-1">
            <h2 className="text-4xl font-bold text-gray-800 mb-4">Data Scientist & ML Engineer</h2>
            <p className="text-xl text-gray-600 mb-6">
              Hi, I'm Rohan. I specialize in machine learning, data analysis, and building AI-powered solutions. 
              With expertise in Python and deep learning frameworks, I help organizations make data-driven decisions.
            </p>
            <div className="flex space-x-4">
              <button className="bg-blue-500 text-white px-6 py-3 rounded-full hover:bg-blue-600 transition">
                View Projects
              </button>
              <button className="border-2 border-blue-500 text-blue-500 px-6 py-3 rounded-full hover:bg-blue-50 transition">
                Contact Me
              </button>
            </div>
          </div>
          <div className="flex-1 flex justify-center">
            <img 
              src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=faces" 
              alt="Rohan's profile" 
              className="w-64 h-64 rounded-full object-cover shadow-xl"
            />
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section id="projects" className="bg-blue-50 py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-12">Featured Projects</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition">
                <img 
                  src={`https://images.unsplash.com/photo-${i === 1 ? '1551288049-dabfa4d677ce' : 
                                                           i === 2 ? '1551288049-dabfa4d677ce' :
                                                           i === 3 ? '1551288049-dabfa4d677ce' : 
                                                                    '1551288049-dabfa4d677ce'}?w=400&h=300`}
                  alt={`Project ${i}`}
                  className="w-full h-48 object-cover"
                />
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-2">Project Title {i}</h3>
                  <p className="text-gray-600 mb-4">A brief description of the project and its impact on business outcomes.</p>
                  <a href="#" className="flex items-center text-blue-500 hover:text-blue-600">
                    View Details <ExternalLink size={16} className="ml-1" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Medium Articles Section */}
      <section id="articles" className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center text-gray-800 mb-12">Latest Articles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {[1, 2].map((i) => (
            <div key={i} className="flex flex-col md:flex-row gap-6 bg-white rounded-xl shadow-lg overflow-hidden">
              <img 
                src={`https://images.unsplash.com/photo-${i === 1 ? '1454165804606-c3d57bc86b40' : '1573164713714-d95e436ab8c6'}?w=400&h=300`}
                alt={`Article ${i}`}
                className="w-full md:w-48 h-48 object-cover"
              />
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-2">Understanding AI: A Deep Dive</h3>
                <p className="text-gray-600 mb-4">Exploring the fundamentals of artificial intelligence and its practical applications in today's world.</p>
                <a href="#" className="flex items-center text-blue-500 hover:text-blue-600">
                  Read More <ExternalLink size={16} className="ml-1" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Work Experience Section */}
      <section id="experience" className="bg-blue-50 py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-12">Work Experience</h2>
          <div className="max-w-3xl mx-auto">
            {[
              {
                title: "Senior Data Scientist",
                company: "Tech Corp",
                period: "2023 - Present",
                description: "Led machine learning initiatives and developed predictive models for customer behavior analysis."
              },
              {
                title: "Data Scientist",
                company: "AI Solutions Inc",
                period: "2021 - 2023",
                description: "Implemented deep learning models for computer vision applications."
              },
              {
                title: "ML Engineer",
                company: "StartupX",
                period: "2020 - 2021",
                description: "Developed and deployed machine learning models for real-time data processing."
              }
            ].map((job, i) => (
              <div key={i} className="relative pl-8 pb-12 last:pb-0">
                <div className="absolute left-0 top-0 h-full w-0.5 bg-blue-200">
                  <div className="absolute -left-1.5 top-2 h-4 w-4 rounded-full border-2 border-blue-500 bg-white"></div>
                </div>
                <div className="bg-white rounded-lg p-6 shadow-md">
                  <h3 className="text-xl font-semibold text-gray-800">{job.title}</h3>
                  <div className="text-blue-600 font-medium mb-2">{job.company}</div>
                  <div className="text-gray-500 text-sm mb-4">{job.period}</div>
                  <p className="text-gray-600">{job.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-gray-600 mb-4 md:mb-0">© 2025 Rohan. All rights reserved.</div>
            <div className="flex space-x-6">
              <a href="#" className="text-gray-600 hover:text-blue-600">Privacy Policy</a>
              <a href="#" className="text-gray-600 hover:text-blue-600">Terms of Service</a>
              <a href="#" className="text-gray-600 hover:text-blue-600">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;