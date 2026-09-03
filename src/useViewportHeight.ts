import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/**
 * On mobile web, `window.innerHeight` (and CSS `100vh`, which the RN-Web
 * root document sizing ultimately traces back to) report the viewport as
 * if the browser's address bar were fully collapsed — the classic "dynamic
 * toolbar" bug. When the toolbar is actually showing (the common case),
 * anything sized off that larger number extends past what's really
 * visible: a bottom-anchored sheet ends up flush to the *oversized* bottom
 * edge, leaving a gap between it and the browser chrome, while content
 * meant to fill the screen can read as clipped at the top.
 *
 * `visualViewport` reports the genuinely-visible size instead, updating
 * live as the toolbar shows/hides — use it when available (every mobile
 * browser that matters here has it); fall back to plain window height on
 * native and in environments without it.
 */
export function useViewportHeight(): number {
  const { height: windowHeight } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState(windowHeight);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) {
      setViewportHeight(windowHeight);
      return;
    }
    const vv = window.visualViewport;
    const update = () => setViewportHeight(vv.height);
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, [windowHeight]);

  return viewportHeight;
}
