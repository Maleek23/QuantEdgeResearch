import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
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
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Create particles on scroll
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = Math.abs(currentScrollY - lastScrollY.current);
      
      if (scrollDelta > 1) {
        // Create particles based on scroll velocity
        const particleCount = Math.min(Math.floor(scrollDelta / 5), 10);
        
        for (let i = 0; i < particleCount; i++) {
          const particle: Particle = {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            life: 60,
            maxLife: 60,
            size: Math.random() * 3 + 1,
            color: `hsl(${Math.random() * 60 + 200}, 70%, 60%)`, // Blue-cyan range
          };
          particlesRef.current.push(particle);
        }
      }
      
      lastScrollY.current = currentScrollY;
    };

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Update and draw particles
      particlesRef.current = particlesRef.current.filter(particle => {
        particle.life--;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.1; // Gravity
        
        if (particle.life <= 0) return false;
        
        // Draw particle
        const alpha = particle.life / particle.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        return true;
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
      className="fixed top-0 left-0 w-full h-full pointer-events-none z-50"
      style={{ mixBlendMode: 'screen' }}
      data-testid="scroll-particles-canvas"
    />
  );
}
