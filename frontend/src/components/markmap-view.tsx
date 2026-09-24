"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Maximize2, Minus, Plus } from "lucide-react";
import type { Markmap } from "markmap-view";

import { Button } from "@/components/ui/button";

/** 一级分支配色，参考经典思维导图的彩色分支。 */
const BRANCH_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#3b82f6",
  "#06b6d4",
  "#f97316",
  "#8b5cf6",
  "#10b981",
  "#ec4899",
];

const ROOT_COLOR = "#111827";

/**
 * 自定义 CSS：根节点黑底白字、一级分支彩色实心块、二级以下纯文字。
 * 通过 markmap 的 `style` 选项注入到 SVG 内部。
 */
const MINDMAP_STYLE = `
.markmap {
  --markmap-font: 400 14px/20px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  --markmap-text-color: #1f2937;
  --markmap-circle-open-bg: #fff;
}
/* markmap 的 depth 从 1 开始：1=根节点，2=一级分支，3=二级…… */
.markmap-node > circle { display: none; }
.markmap-node > line { display: none; }
.markmap-link { stroke-linecap: round; stroke-linejoin: round; }
.markmap-node[data-depth="1"] .markmap-foreign > div > div {
  background: ${ROOT_COLOR};
  color: #fff;
  font-weight: 700;
  font-size: 17px;
  line-height: 24px;
  padding: 10px 16px;
  border-radius: 8px;
  box-shadow: 0 3px 8px rgba(15, 23, 42, 0.28);
  white-space: normal;
}
.markmap-node[data-depth="2"] .markmap-foreign > div > div {
  background: var(--mm-branch-color, #3b82f6);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  line-height: 20px;
  padding: 6px 12px;
  border-radius: 6px;
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.18);
}
.markmap-node[data-depth="3"] .markmap-foreign > div > div {
  color: #111827;
  font-weight: 600;
}
.markmap-node[data-depth="4"] .markmap-foreign > div > div,
.markmap-node[data-depth="5"] .markmap-foreign > div > div,
.markmap-node[data-depth="6"] .markmap-foreign > div > div {
  color: #374151;
  font-size: 13px;
}
`;

interface MarkmapNodeState {
  path?: string;
}

interface MarkmapNodeLike {
  state?: MarkmapNodeState;
}

/** 按一级分支分组取色，让同一分支的连线和方块同色。 */
function branchColor(node: MarkmapNodeLike): string {
  const path = node.state?.path;
  if (!path) {
    return BRANCH_COLORS[0];
  }
  const segments = path.split(".");
  if (segments.length <= 1) {
    return ROOT_COLOR;
  }
  const branchIndex = Number(segments[1]) - 1;
  return BRANCH_COLORS[
    ((branchIndex % BRANCH_COLORS.length) + BRANCH_COLORS.length) %
      BRANCH_COLORS.length
  ];
}

interface MarkmapViewProps {
  markdown: string;
  /** 导出 SVG 时的文件名前缀。 */
  filename?: string;
  height?: number;
}

/**
 * 用 markmap 渲染 Markdown 大纲。
 *
 * markmap 体积不小，所以这里动态 import，只有真正用到时才加载。
 */
export function MarkmapView({
  markdown,
  filename = "mindmap",
  height = 420,
}: MarkmapViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const instanceRef = useRef<Markmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * markmap 不会把分支颜色写到节点元素上，只有连线和圆圈带 stroke。
   * 这里按 data-path 把分支色写进 CSS 变量，供上面注入的样式着色一级分支方块。
   */
  const paintBranches = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    svg.querySelectorAll<SVGGElement>("g.markmap-node").forEach((group) => {
      const path = group.getAttribute("data-path") ?? "";
      const color = branchColor({ state: { path } });
      group.style.setProperty("--mm-branch-color", color);
      group.querySelectorAll("line, path").forEach((shape) => {
        shape.setAttribute("stroke", color);
      });
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let repaintTimer: number | null = null;

    const render = async () => {
      try {
        const [{ Transformer }, { Markmap: MarkmapClass }] = await Promise.all([
          import("markmap-lib"),
          import("markmap-view"),
        ]);
        if (disposed || !svgRef.current) {
          return;
        }
        const transformer = new Transformer();
        const { root } = transformer.transform(markdown || "# 暂无内容");

        if (!instanceRef.current) {
          instanceRef.current = MarkmapClass.create(
            svgRef.current,
            {
              autoFit: true,
              initialExpandLevel: -1,
              duration: 220,
              maxWidth: 420,
              nodeMinHeight: 20,
              paddingX: 12,
              spacingHorizontal: 56,
              spacingVertical: 10,
              color: (node) => branchColor(node as MarkmapNodeLike),
              lineWidth: (node) =>
                ((node as MarkmapNodeLike).state?.path?.split(".").length ?? 1) <= 3
                  ? 3
                  : 1.8,
              style: () => MINDMAP_STYLE,
            },
            root,
          );
        } else {
          await instanceRef.current.setData(root);
        }
        await instanceRef.current.fit();
        paintBranches();
        // 折叠/展开有动画，动画结束后再补一次颜色。
        repaintTimer = window.setTimeout(paintBranches, 400);
        setReady(true);
        setError(null);
      } catch (err) {
        if (!disposed) {
          setError(
            err instanceof Error
              ? `思维导图渲染失败：${err.message}`
              : "思维导图渲染失败",
          );
        }
      }
    };

    void render();
    return () => {
      disposed = true;
      if (repaintTimer !== null) {
        window.clearTimeout(repaintTimer);
      }
    };
  }, [markdown, paintBranches]);

  useEffect(() => {
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []);

  const handleZoom = useCallback(async (factor: number) => {
    const instance = instanceRef.current;
    if (!instance) {
      return;
    }
    await instance.rescale(factor);
  }, []);

  const handleFit = useCallback(async () => {
    await instanceRef.current?.fit();
  }, []);

  const handleDownload = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const box = svg.getBoundingClientRect();
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(Math.max(1, Math.round(box.width))));
    clone.setAttribute("height", String(Math.max(1, Math.round(box.height))));
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [filename]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleFit()}
          disabled={!ready}
        >
          <Maximize2 className="mr-1 h-3.5 w-3.5" />
          适应窗口
        </Button>
        <Button
          size="icon"
          variant="outline"
          title="放大"
          onClick={() => void handleZoom(1.25)}
          disabled={!ready}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          title="缩小"
          onClick={() => void handleZoom(0.8)}
          disabled={!ready}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={handleDownload} disabled={!ready}>
          <Download className="mr-1 h-3.5 w-3.5" />
          导出 SVG
        </Button>
        <span className="text-xs text-muted-foreground">
          滚轮缩放，点击节点可折叠
        </span>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-border/70 bg-white p-2 shadow-inner">
        <svg
          ref={svgRef}
          className="w-full"
          style={{ height: `${height}px` }}
          role="img"
          aria-label="思维导图"
        />
      </div>
    </div>
  );
}
