function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function copySvgStyles(source: Element, target: Element): void {
  const computed = window.getComputedStyle(source);
  const style = target.getAttribute("style") ?? "";
  target.setAttribute(
    "style",
    `${style};${Array.from(computed)
      .map((property) => `${property}:${computed.getPropertyValue(property)}`)
      .join(";")}`
  );

  Array.from(source.children).forEach((child, index) => {
    const targetChild = target.children.item(index);
    if (targetChild) copySvgStyles(child, targetChild);
  });
}

function svgDimensions(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.viewBox.baseVal;
  if (viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const rect = svg.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width || Number(svg.getAttribute("width")) || 1200),
    height: Math.max(1, rect.height || Number(svg.getAttribute("height")) || 720)
  };
}

export async function exportSvgAsPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  copySvgStyles(svg, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const { width, height } = svgDimensions(svg);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const serialized = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to render the Gantt chart image."));
    });
    image.src = url;
    await loaded;

    const scale = Math.max(1, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create an image export context.");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to create the PNG export."));
      }, "image/png");
    });

    downloadBlob(pngBlob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function printGantt(): void {
  document.body.classList.add("gantt-printing");

  const cleanup = () => {
    document.body.classList.remove("gantt-printing");
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  window.requestAnimationFrame(() => {
    window.print();
    window.setTimeout(cleanup, 1000);
  });
}
