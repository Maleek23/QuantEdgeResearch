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
      
      // Recreate ambient particles on resize
      const ambientCount = 40;
      particlesRef.current = particlesRef.current.filter(p => !p.isAmbient);
      
      for (let i = 0; i < ambientCount; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
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
        const momentumY = Math.sign(scrollDelta) * Math.min(scrollSpeed * 0.05, 5);
        scrollMomentum.current.y = momentumY;
        
        // Add STRONG drift to all particles based on scroll direction for visibility
        particlesRef.current.forEach(particle => {
          particle.vy += momentumY * 0.4; // Increased from 0.15 to 0.4 for more obvious effect
          // Add horizontal drift for more dynamic feel
          particle.vx += (Math.random() - 0.5) * 0.8;
          // Temporarily increase opacity during scroll for visibility
          if (!particle.isAmbient) {
            particle.opacity = Math.min(0.9, particle.opacity + 0.2);
          }
        });
      }
      
      // Enforce maximum particle count (ambient + scroll particles)
      const MAX_TOTAL_PARTICLES = 100;
      const currentCount = particlesRef.current.length;
      
      if (scrollSpeed > 1 && currentCount < MAX_TOTAL_PARTICLES) {
        // Create MORE particles based on scroll velocity for better visibility
        const particleCount = Math.min(Math.floor(scrollSpeed / 3), 12); // Increased from /5 and 8
        const allowedCount = Math.min(particleCount, MAX_TOTAL_PARTICLES - currentCount);
        
        for (let i = 0; i < allowedCount; i++) {
          particlesRef.current.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 3, // Increased from 2
            vy: Math.sign(scrollDelta) * (Math.random() * 2.5 + 1), // Increased for visibility
            size: Math.random() * 2.5 + 1.5, // Slightly larger particles
            opacity: Math.random() * 0.5 + 0.4, // Brighter particles
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
        // Apply velocity dampening for smooth deceleration
        particle.vx *= 0.96; // Reduced from 0.98 to keep momentum longer
        particle.vy *= 0.96; // Reduced from 0.98 to keep momentum longer
        
        // Gradually reduce opacity back to normal
        if (!particle.isAmbient && particle.opacity > 0.5) {
          particle.opacity *= 0.99;
        }
        
        // Keep ambient particles at minimum velocity
        if (particle.isAmbient) {
          const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
          if (speed < 0.2) {
            particle.vx = (Math.random() - 0.5) * 0.3;
            particle.vy = (Math.random() - 0.5) * 0.3;
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
        
        // Draw particle (node)
        ctx.save();
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = 'rgba(6, 182, 212, 1)'; // cyan-500 - neural network color
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Draw neural connections to nearby particles
        particlesRef.current.forEach((otherParticle) => {
          if (particle === otherParticle) return;
          
          const dx = particle.x - otherParticle.x;
          const dy = particle.y - otherParticle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Draw connection if particles are close enough
          if (distance < 120) {
            const connectionAlpha = particle.opacity * (1 - distance / 120) * 0.15;
            ctx.save();
            ctx.globalAlpha = connectionAlpha;
            ctx.strokeStyle = 'rgba(6, 182, 212, 1)'; // cyan-500
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
