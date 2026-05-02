'use client'
import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

interface SlackMember {
  id: string
  name: string
  email: string
  avatar: string
}

interface Props {
  value: string
  onChange: (id: string) => void
}

export function SlackMemberSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState<SlackMember[]>([])
  const [selected, setSelected] = useState<SlackMember | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async (q: string) => {
    if (!q) { setMembers([]); setError(null); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/slack/members?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) {
        setMembers([])
        setError(data.error ?? 'Slack 멤버를 불러오지 못했습니다')
        return
      }
      setMembers(data.members ?? [])
    } catch {
      setMembers([])
      setError('Slack 멤버를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="space-y-2">
      <Input
        placeholder="이름 또는 이메일 검색..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          search(e.target.value)
        }}
        className="border-border"
      />
      <Input
        name="slackUserId"
        placeholder="Slack User ID 직접 입력"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="border-border font-mono"
      />
      {selected && (
        <div className="flex items-center gap-2 text-sm text-graphite">
          <Avatar className="size-6">
            <AvatarImage src={selected.avatar} />
            <AvatarFallback>{selected.name?.[0]}</AvatarFallback>
          </Avatar>
          <span>{selected.name}</span>
          <span className="text-stone font-mono text-xs">{selected.email}</span>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      {members.length > 0 && (
        <ul className="border border-border rounded-lg bg-paper shadow-sm divide-y divide-border max-h-48 overflow-y-auto">
          {members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-parchment text-left"
                onClick={() => {
                  setSelected(m)
                  onChange(m.id)
                  setQuery(m.name)
                  setMembers([])
                }}
              >
                <Avatar className="size-7">
                  <AvatarImage src={m.avatar} />
                  <AvatarFallback>{m.name?.[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm text-ink font-medium">{m.name}</p>
                  <p className="text-xs text-stone font-mono">{m.email}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && <p className="text-xs text-stone">검색 중...</p>}
    </div>
  )
}
