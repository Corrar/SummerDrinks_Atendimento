import { useEffect, useState } from 'react';

/**
 * Largura da viewport + breakpoints, para layouts responsivos com estilos inline
 * (o painel é quase todo inline, portado do protótipo — media query não alcança).
 *   isMobile  < 720px  → tudo em coluna única
 *   isTablet  < 1024px → grids de 2 colunas viram 1
 */
export function useViewport() {
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return { w, isMobile: w < 720, isTablet: w < 1024 };
}
