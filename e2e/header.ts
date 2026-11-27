import { expect, type Page } from "@playwright/test";

/** Widths from tablet to wide desktop, including common laptop sizes. */
export const headerWidths = [
  768, 860, 861, 960, 1024, 1100, 1180, 1280, 1366, 1400, 1440, 1480, 1536,
  1600, 1680, 1920,
];

/**
 * At each width the bar stays one line, nothing in it overlaps the centred
 * Compose/Send control, and nothing runs past the page edge.
 */
export async function expectHeaderFits(page: Page) {
  for (const width of headerWidths) {
    await page.setViewportSize({ width, height: 800 });
    const layout = await page.evaluate(() => {
      const nav = document.querySelector("header nav[aria-label='Main']")!;
      const bar = nav.parentElement!;
      const box = (element: Element) => element.getBoundingClientRect();
      const visible = (element: Element) => {
        const r = box(element);
        return r.width > 1 && r.height > 1;
      };
      const [brand, , cluster] = [...bar.children];
      return {
        page: document.documentElement.scrollWidth,
        bar: box(bar).height,
        brandRight: box(brand!).right,
        nav: { left: box(nav).left, right: box(nav).right },
        items: [...cluster!.children].filter(visible).map((item) => ({
          text: item.textContent?.trim(),
          left: box(item).left,
          right: box(item).right,
        })),
      };
    });
    const where = `at ${width}px`;
    expect(layout.page, where).toBe(width);
    expect(layout.bar, where).toBeLessThanOrEqual(61);
    expect(layout.brandRight, where).toBeLessThanOrEqual(layout.nav.left);
    expect(layout.items.length, where).toBeGreaterThan(0);
    for (const item of layout.items) {
      expect(item.left, `${where}: ${item.text}`).toBeGreaterThanOrEqual(
        layout.nav.right,
      );
      expect(item.right, `${where}: ${item.text}`).toBeLessThanOrEqual(width);
    }
  }
}
