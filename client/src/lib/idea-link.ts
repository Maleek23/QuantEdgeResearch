/** /idea/:id — the standalone Setup Detail for any idea id (pages/idea-detail.tsx). Accepts journal ids (`desk:<id>`). */
export const ideaDetailHref = (id: string) => `/idea/${encodeURIComponent(String(id).replace(/^desk:/, ''))}`;
