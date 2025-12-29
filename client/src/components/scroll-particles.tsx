import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  isAmbient: boolean;
}

export function ScrollParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const lastScrollY = useRef(0);
  const scrollMomentum = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      // Reduced particle count for better performance
      const ambientCount = 20; // Reduced from 40
      particlesRef.current = particlesRef.current.filter(p => !p.isAmbient);
      
      for (let i = 0; i < ambientCount; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          size: Math.random() * 2 + 1,
          opacity: Math.random() * 0.3 + 0.2,
          isAmbient: true,
        });
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Create particles on scroll - neural network style with interactive momentum
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollY.current;
      const scrollSpeed = Math.abs(scrollDelta);
      
      // Apply scroll momentum to ALL particles for interactive feel
      if (scrollSpeed > 1) {
        const momentumY = Math.sign(scrollDelta) * Math.min(scrollSpeed * 0.02, 2);
        scrollMomentum.current.y = momentumY;
        
        // Add gentle drift to all particles based on scroll direction
        particlesRef.current.forEach(particle => {
          particle.vy += momentumY * 0.2;
          // Add horizontal drift for more dynamic feel
          particle.vx += (Math.random() - 0.5) * 0.3;
          // Temporarily increase opacity during scroll for visibility
          if (!particle.isAmbient) {
            particle.opacity = Math.min(0.8, particle.opacity + 0.15);
          }
        });
      }
      
      // Enforce maximum particle count (ambient + scroll particles) - reduced for performance
      const MAX_TOTAL_PARTICLES = 50; // Reduced from 100
      const currentCount = particlesRef.current.length;
      
      if (scrollSpeed > 2 && currentCount < MAX_TOTAL_PARTICLES) { // Increased threshold
        // Create particles based on scroll velocity
        const particleCount = Math.min(Math.floor(scrollSpeed / 6), 5); // Reduced
        const allowedCount = Math.min(particleCount, MAX_TOTAL_PARTICLES - currentCount);
        
        for (let i = 0; i < allowedCount; i++) {
          particlesRef.current.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 1.5,
            vy: Math.sign(scrollDelta) * (Math.random() * 1.2 + 0.4),
            size: Math.random() * 2.5 + 1.5,
            opacity: Math.random() * 0.5 + 0.4,
            isAmbient: false,
          });
        }
      }
      
      lastScrollY.current = currentScrollY;
    };

    // Animation loop - neural network style with connections
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Decay scroll momentum
      scrollMomentum.current.y *= 0.95;
      scrollMomentum.current.x *= 0.95;
      
      // Update and draw particles
      particlesRef.current.forEach(particle => {
        // Ambient particles: CONSTANT velocity like landing page
        if (particle.isAmbient) {
          // Maintain constant gentle movement (no dampening for ambient)
          const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
          if (speed < 0.1 || speed > 0.3) {
            particle.vx = (Math.random() - 0.5) * 0.4;
            particle.vy = (Math.random() - 0.5) * 0.4;
          }
        } else {
          // Scroll particles: Apply velocity dampening
          particle.vx *= 0.97;
          particle.vy *= 0.97;
          
          // Gradually reduce opacity back to normal
          if (particle.opacity > 0.5) {
            particle.opacity *= 0.98;
          }
        }
        
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;
        
        // Wrap around edges for ambient particles
        if (particle.isAmbient) {
          if (particle.x < 0) particle.x = canvas.width;
          if (particle.x > canvas.width) particle.x = 0;
          if (particle.y < 0) particle.y = canvas.height;
          if (particle.y > canvas.height) particle.y = 0;
        }
        
        // Detect if dark mode is active
        const isDarkMode = document.documentElement.classList.contains('dark');
        
        // Use theme-appropriate colors - subtle in light mode, visible in dark mode
        const particleColor = isDarkMode 
          ? 'rgba(6, 182, 212, 1)'      // cyan-500 for dark mode
          : 'rgba(8, 145, 178, 0.6)';   // cyan-600 with transparency for light mode
        const connectionColor = isDarkMode
          ? 'rgba(6, 182, 212, 1)'
          : 'rgba(8, 145, 178, 0.4)';
        
        // Draw particle (node)
        ctx.save();
        ctx.globalAlpha = isDarkMode ? particle.opacity : particle.opacity * 0.5;
        ctx.fillStyle = particleColor;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Draw neural connections to nearby particles - reduced distance for performance
        particlesRef.current.forEach((otherParticle) => {
          if (particle === otherParticle) return;
          
          const dx = particle.x - otherParticle.x;
          const dy = particle.y - otherParticle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Draw connection if particles are close enough (reduced from 120)
          if (distance < 80) {
            const connectionAlpha = particle.opacity * (1 - distance / 80) * (isDarkMode ? 0.15 : 0.08);
            ctx.save();
            ctx.globalAlpha = connectionAlpha;
            ctx.strokeStyle = connectionColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(otherParticle.x, otherParticle.y);
            ctx.stroke();
            ctx.restore();
          }
        });
      });
      
      // Remove scroll-triggered particles that are off-screen
      particlesRef.current = particlesRef.current.filter(particle => {
        if (particle.isAmbient) return true;
        return particle.x >= -10 && particle.x <= canvas.width + 10 &&
               particle.y >= -10 && particle.y <= canvas.height + 10;
      });
      
      animationFrameId.current = requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('scroll', handleScroll);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none z-50 opacity-40"
      data-testid="scroll-particles-canvas"
    />
  );
}
