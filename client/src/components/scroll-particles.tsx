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

    // Create particles on scroll - neural network style
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = Math.abs(currentScrollY - lastScrollY.current);
      
      if (scrollDelta > 1) {
        // Create particles based on scroll velocity
        const particleCount = Math.min(Math.floor(scrollDelta / 5), 8);
        
        for (let i = 0; i < particleCount; i++) {
          particlesRef.current.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5,
            size: Math.random() * 2 + 1,
            opacity: Math.random() * 0.4 + 0.3,
            isAmbient: false,
          });
        }
      }
      
      lastScrollY.current = currentScrollY;
    };

    // Animation loop - neural network style with connections
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Update and draw particles
      particlesRef.current.forEach(particle => {
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
