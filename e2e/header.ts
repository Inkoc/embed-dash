import { expect, type Page } from "@playwright/test";

/**
 * Waits three frames after a resize before anything is measured: the resize
 * observers report after layout in one frame, the bar refits in the next, and
 * the third lets anything that refit moved report and settle.
 */
export const settled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
      ),
  );

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
    await settled(page);
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

/** Phone widths, where the views take a row of their own. */
export const phoneWidths = [320, 360, 400, 480, 639];

/** Adds stand-in views until the bar has `count`, so the layout is checked at the size it must hold. */
export async function padViews(page: Page, count: number) {
  await page.evaluate((count) => {
    const links = [...document.querySelectorAll("header nav a")];
    const last = links.at(-1)!;
    for (let i = links.length; i < count; i++) {
      const copy = last.cloneNode(true) as HTMLElement;
      copy.removeAttribute("aria-current");
      copy.removeAttribute("data-active");
      copy.textContent = "History";
      last.parentElement!.append(copy);
    }
  }, count);
}

/**
 * At each phone width the views sit on their own full-width row under the
 * brand and the cluster: nothing overlaps, nothing runs past the page edge,
 * every view is a full tap target with its whole label showing, and the
 * measured bar height covers both rows.
 */
export async function expectPhoneHeaderFits(page: Page) {
  for (const width of phoneWidths) {
    await page.setViewportSize({ width, height: 800 });
    await settled(page);

    const layout = await page.evaluate(() => {
      const nav = document.querySelector("header nav[aria-label='Main']")!;
      const bar = nav.parentElement!;
      const box = (element: Element) => element.getBoundingClientRect();
      const [brand, , cluster] = [...bar.children];
      const controls = [brand!, ...cluster!.children]
        .map(box)
        .filter((r) => r.width > 1 && r.height > 1);
      const links = [...nav.querySelectorAll("a")];
      return {
        page: document.documentElement.scrollWidth,
        header: box(document.querySelector("header")!).height,
        barHeight: parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--bar-height",
          ),
        ),
        nav: box(nav),
        controlsBottom: Math.max(...controls.map((r) => r.bottom)),
        links: links.map((link) => ({
          text: link.textContent,
          height: box(link).height,
          width: box(link).width,
          clipped: link.scrollWidth > link.clientWidth,
        })),
      };
    });
    const where = `at ${width}px`;
    expect(layout.page, where).toBe(width);
    expect(layout.nav.top, where).toBeGreaterThanOrEqual(layout.controlsBottom);
    expect(layout.nav.left, where).toBeGreaterThanOrEqual(0);
    expect(layout.nav.right, where).toBeLessThanOrEqual(width);
    expect(layout.barHeight, where).toBeCloseTo(layout.header, 0);
    const widths = layout.links.map((link) => Math.round(link.width));
    expect(
      Math.max(...widths) - Math.min(...widths),
      where,
    ).toBeLessThanOrEqual(1);
    for (const link of layout.links) {
      expect(link.height, `${where}: ${link.text}`).toBeGreaterThanOrEqual(44);
      expect(link.clipped, `${where}: ${link.text}`).toBe(false);
    }
  }
}
