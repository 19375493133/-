"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSession } from "@/lib/api";
import { ApiError } from "@/lib/api";

function today(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function SessionForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [teacher, setTeacher] = useState("");
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await createSession({ title, course, teacher, date });
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "创建失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>新建听课会话</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="title">标题 *</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：高等数学第一讲"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="course">课程</Label>
              <Input
                id="course"
                value={course}
                onChange={(event) => setCourse(event.target.value)}
                placeholder="高等数学"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacher">教师</Label>
              <Input
                id="teacher"
                value={teacher}
                onChange={(event) => setTeacher(event.target.value)}
                placeholder="张老师"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">上课日期</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "创建中..." : "创建会话"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

