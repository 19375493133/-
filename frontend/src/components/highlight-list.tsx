import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDuration, highlightLabel } from "@/lib/utils";
import type { Highlight } from "@/lib/types";

const badgeVariants: Record<
  Highlight["type"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  important: "default",
  difficult: "destructive",
  question: "outline",
  note: "secondary",
};

export function HighlightList({ highlights }: { highlights: Highlight[] }) {
  if (highlights.length === 0) {
    return <p className="text-sm text-muted-foreground">还没有课堂标记。</p>;
  }

  return (
    <div className="space-y-2">
      {highlights.map((item) => (
        <div
          key={item.id}
          className="rounded-md border p-3 text-sm"
        >
          <div className="mb-1 flex items-center gap-2">
            <Badge variant={badgeVariants[item.type]}>
              {highlightLabel(item.type)}
            </Badge>
            <span className="text-muted-foreground">
              {formatDuration(item.timestamp_seconds)}
            </span>
            {item.speaker ? (
              <span className="text-muted-foreground">· {item.speaker}</span>
            ) : null}
          </div>
          <p className="whitespace-pre-wrap">{item.content}</p>
        </div>
      ))}
    </div>
  );
}

export function HighlightListCard({
  highlights,
}: {
  highlights: Highlight[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">课堂标记</CardTitle>
      </CardHeader>
      <CardContent>
        <HighlightList highlights={highlights} />
      </CardContent>
    </Card>
  );
}

