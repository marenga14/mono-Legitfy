import type { Directive } from "vue";

/** Fades an element in once, the first time it scrolls into view. */
export const reveal: Directive<HTMLElement> = {
  mounted(el) {
    if (!("IntersectionObserver" in window)) return;
    el.classList.add("reveal");
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      el.classList.add("is-in");
      observer.disconnect();
    }, { threshold: 0.2 });
    observer.observe(el);
  },
};
