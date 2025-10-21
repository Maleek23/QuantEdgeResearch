/**
 * Check if WebGL is supported in the current browser
 */
export function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (context) {
      // Clean up
      if (context instanceof WebGLRenderingContext) {
        const loseContext = context.getExtension('WEBGL_lose_context');
        if (loseContext) {
          loseContext.loseContext();
        }
      }
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}
