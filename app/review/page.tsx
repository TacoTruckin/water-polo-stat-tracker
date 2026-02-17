'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { useProfile } from '@/lib/useProfile';
import { useGame } from '@/lib/store';
import type { Context, EventType, Quarter, SessionScope, Team } from '@/lib/types';

type SessionRow = {
  id: string;
  game_id: string;
  role_scope: SessionScope;
  started_at: string | null;
  created_at: string;
  games?: {
    opponent_name: string;
    scheduled_at: string;
  } | null;
};

type GameRow = {
  id: string;
  opponent_name: string;
  scheduled_at: string;
  location: string | null;
};

type EventRow = {
  id: string;
  event_type: EventType;
  team: Team;
  player_id: string;
  quarter: Quarter;
  context: Context;
  clock_ms: number | null;
  clock_display?: string | null;
  event_elapsed_game_seconds?: number | null;
  segment_id?: string | null;
  event_video_seconds?: number | null;
  status?: 'draft' | 'audited' | 'rejected';
  audited_by?: string | null;
  audited_at?: string | null;
  audit_notes?: string | null;
  updated_at?: string | null;
  version?: number | null;
  occurred_at: string;
  created_by: string | null;
  payload?: { shot?: { zone: string; outcome: string } } | null;
  video_segments?: {
    id: string;
    segment_index: number;
    label: string | null;
    source_url: string | null;
    source_type: string | null;
    segment_start_game_seconds: number;
  } | null;
};

type PresenceRow = {
  session_id: string;
  user_id: string;
  last_seen_at: string;
  user_profiles?: {
    name: string | null;
    email: string | null;
  } | null;
};

function ReviewPageContent() {
  const { user, loading: authLoading, supabaseReady } = useRequireAuth('/login');
  const { profile, loading: profileLoading } = useProfile(user);
  const searchParams = useSearchParams();
  const { dispatch } = useGame();
  const sessionId = searchParams.get('sessionId');
  const gameIdParam = searchParams.get('gameId');
  const isAggregateView = Boolean(gameIdParam);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, { id: string; name: string | null; email: string | null }>>(
    {}
  );
  const [trackerFilter, setTrackerFilter] = useState('all');
  const [fps, setFps] = useState('29.97');
  const [preRollSeconds, setPreRollSeconds] = useState(3);
  const [dedupeWindowSeconds, setDedupeWindowSeconds] = useState(4);
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{
    opponent: string;
    startedAt: string | null;
    gameId: string | null;
  } | null>(null);
  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportAllStatuses, setExportAllStatuses] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [remapping, setRemapping] = useState(false);
  const [remapResult, setRemapResult] = useState<string | null>(null);

  const canUseSupabase = supabase !== null && supabaseReady;
  const isAdmin = profile?.role === 'super_admin';

  const formatClock = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const formatLastSeen = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const seconds = Math.max(0, Math.floor(diffMs / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  const formatTimecode = (totalSeconds: number, fpsValue: number) => {
    const clamped = Math.max(0, totalSeconds);
    const wholeSeconds = Math.floor(clamped);
    const frames = Math.floor((clamped - wholeSeconds) * fpsValue);
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const seconds = wholeSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
      seconds
    ).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  };

  const escapeCsv = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '';
    const raw = String(value);
    if (/[",\n]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };

  useEffect(() => {
    if (!canUseSupabase || !user) {
      setSessions([]);
      setGames([]);
      return;
    }
    const loadSessions = async () => {
      const supabaseClient = supabase;
      if (!supabaseClient) return;
      setLoadingSessions(true);
      setError(null);
      let query = supabaseClient
        .from('sessions')
        .select('id, game_id, role_scope, started_at, created_at, games(opponent_name, scheduled_at)')
        .order('created_at', { ascending: false });
      if (profile?.role !== 'super_admin') {
        query = query.eq('created_by', user.id);
      }
      const { data, error } = await query;
      if (error) {
        setError(error.message);
        setLoadingSessions(false);
        return;
      }
      const mapped = (data ?? []).map((row) => {
        const game = Array.isArray(row.games) ? row.games[0] ?? null : row.games ?? null;
        return { ...row, games: game } as SessionRow;
      });
      setSessions(mapped);
      if (profile?.role === 'super_admin') {
        const { data: gamesData } = await supabaseClient
          .from('games')
          .select('id, opponent_name, scheduled_at, location')
          .order('scheduled_at', { ascending: false });
        setGames((gamesData ?? []) as GameRow[]);
      } else {
        setGames([]);
      }
      setLoadingSessions(false);
    };
    void loadSessions();
  }, [canUseSupabase, profile?.role, user]);

  useEffect(() => {
    if (!canUseSupabase || (!sessionId && !gameIdParam)) {
      setEvents([]);
      setSessionInfo(null);
      return;
    }
    let active = true;
    const loadSessionOrGame = async () => {
      const supabaseClient = supabase;
      if (!supabaseClient) return;
      if (gameIdParam) {
        const { data: gameData } = await supabaseClient
          .from('games')
          .select('id, opponent_name, scheduled_at')
          .eq('id', gameIdParam)
          .maybeSingle();
        if (!active) return;
        if (!gameData) {
          setSessionInfo(null);
          return;
        }
        setSessionInfo({ opponent: gameData.opponent_name ?? '', startedAt: null, gameId: gameData.id });
        return;
      }
      if (!sessionId) return;
      const { data } = await supabaseClient
        .from('sessions')
        .select('id, game_id, started_at, created_at, games(opponent_name)')
        .eq('id', sessionId)
        .maybeSingle();
      if (!active) return;
      if (!data) {
        setSessionInfo(null);
        return;
      }
      const game = Array.isArray(data.games) ? data.games[0] ?? null : data.games ?? null;
      const opponent = game?.opponent_name ?? '';
      const startedAt = data.started_at ?? data.created_at ?? null;
      setSessionInfo({ opponent, startedAt, gameId: data.game_id ?? null });
      if (opponent) {
        dispatch({
          type: 'SET_GAME_META',
          opponent,
          createdAt: startedAt ? Date.parse(startedAt) : Date.now()
        });
      }
    };
    void loadSessionOrGame();
    return () => {
      active = false;
    };
  }, [canUseSupabase, dispatch, gameIdParam, sessionId]);

  useEffect(() => {
    if (!canUseSupabase || (!sessionId && !gameIdParam)) return;
    let active = true;
    const loadEvents = async () => {
      const supabaseClient = supabase;
      if (!supabaseClient) return;
      setLoadingEvents(true);
      setError(null);
      const selectFields = isAdmin
        ? 'id, event_type, team, player_id, quarter, context, clock_ms, clock_display, event_elapsed_game_seconds, segment_id, event_video_seconds, status, audited_by, audited_at, audit_notes, updated_at, version, occurred_at, payload, created_by, video_segments(id, segment_index, label, source_url, source_type, segment_start_game_seconds)'
        : 'id, event_type, team, player_id, quarter, context, clock_ms, occurred_at, payload, created_by';
      let query = supabaseClient.from('events').select(selectFields);
      if (gameIdParam) {
        query = query.eq('game_id', gameIdParam);
      } else if (sessionId) {
        query = query.eq('session_id', sessionId);
      }
      const { data, error } = await query.order('occurred_at', { ascending: false });
      if (!active) return;
      if (error) {
        setError(error.message);
        setLoadingEvents(false);
        return;
      }
      const rows = Array.isArray(data) ? (data as unknown as EventRow[]) : [];
      const normalized = rows.map((row) => {
        if (row.video_segments && Array.isArray(row.video_segments)) {
          return { ...row, video_segments: row.video_segments[0] ?? null };
        }
        return row;
      }) as EventRow[];
      setEvents(normalized);
      if (profile?.role === 'super_admin') {
        const ids = Array.from(
          new Set(rows.map((row) => row.created_by).filter((value): value is string => Boolean(value)))
        );
        if (ids.length > 0) {
          const { data: profilesData } = await supabaseClient
            .from('user_profiles')
            .select('id, name, email')
            .in('id', ids);
          if (profilesData) {
            const nextMap: Record<string, { id: string; name: string | null; email: string | null }> = {};
            profilesData.forEach((profileRow) => {
              nextMap[profileRow.id] = {
                id: profileRow.id,
                name: profileRow.name ?? null,
                email: profileRow.email ?? null
              };
            });
            setProfileMap(nextMap);
          }
        } else {
          setProfileMap({});
        }
      } else {
        setProfileMap({});
      }
      setLoadingEvents(false);
    };
    void loadEvents();

    const supabaseClient = supabase;
    if (!supabaseClient) return () => undefined;
    const channel = supabaseClient.channel(
      `review-events:${gameIdParam ?? sessionId ?? 'unknown'}`
    );
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'events',
        filter: gameIdParam ? `game_id=eq.${gameIdParam}` : `session_id=eq.${sessionId}`
      },
      () => {
        void loadEvents();
      }
    );
    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'events',
        filter: gameIdParam ? `game_id=eq.${gameIdParam}` : `session_id=eq.${sessionId}`
      },
      () => {
        void loadEvents();
      }
    );
    channel.subscribe();

    return () => {
      active = false;
      channel.unsubscribe();
    };
  }, [canUseSupabase, gameIdParam, isAdmin, profile?.role, sessionId]);

  useEffect(() => {
    if (!canUseSupabase || !isAdmin || !gameIdParam) {
      setPresence([]);
      return;
    }
    let active = true;
    const loadPresence = async () => {
      const supabaseClient = supabase;
      if (!supabaseClient) return;
      const { data: sessionRows } = await supabaseClient
        .from('sessions')
        .select('id')
        .eq('game_id', gameIdParam);
      const sessionIds = (sessionRows ?? []).map((row) => row.id);
      if (sessionIds.length === 0) {
        setPresence([]);
        return;
      }
      const { data: presenceRows } = await supabaseClient
        .from('session_presence')
        .select('session_id, user_id, last_seen_at, user_profiles(name, email)')
        .in('session_id', sessionIds);
      if (!active) return;
      const normalized = (presenceRows ?? []).map((row) => {
        if (row.user_profiles && Array.isArray(row.user_profiles)) {
          return { ...row, user_profiles: row.user_profiles[0] ?? null };
        }
        return row;
      });
      setPresence(normalized as PresenceRow[]);
    };
    void loadPresence();
    const interval = window.setInterval(loadPresence, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [canUseSupabase, gameIdParam, isAdmin]);

  useEffect(() => {
    if (profile?.role !== 'super_admin') {
      setTrackerFilter('all');
    }
  }, [profile?.role]);

  const formattedSessionTime = useMemo(() => {
    if (!sessionInfo?.startedAt) return '';
    const date = new Date(sessionInfo.startedAt);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }, [sessionInfo?.startedAt]);

  const trackerLabel = (userId: string | null, isAdminView: boolean) => {
    if (!userId) return 'Unknown';
    if (user?.id && userId === user.id) return 'You';
    if (!isAdminView) return 'Tracker';
    const profileRow = profileMap[userId];
    if (profileRow?.name) return profileRow.name;
    if (profileRow?.email) return profileRow.email;
    return `${userId.slice(0, 6)}…`;
  };

  const trackerOptions = useMemo(() => {
    const ids = Array.from(
      new Set(events.map((event) => event.created_by).filter((value): value is string => Boolean(value)))
    );
    if (profile?.role !== 'super_admin') {
      return user?.id ? [{ id: user.id, label: 'You' }] : [];
    }
    return ids.map((id) => ({ id, label: trackerLabel(id, true) }));
  }, [events, profile?.role, profileMap, user?.id]);

  const activeTrackers = useMemo(() => {
    if (!isAdmin || !presence.length) return [];
    const cutoff = Date.now() - 2 * 60 * 1000;
    return presence
      .map((row) => ({
        userId: row.user_id,
        lastSeen: row.last_seen_at,
        label:
          row.user_profiles?.name ||
          row.user_profiles?.email ||
          `${row.user_id.slice(0, 6)}…`
      }))
      .filter((row) => new Date(row.lastSeen).getTime() >= cutoff);
  }, [isAdmin, presence]);

  const duplicateEventIds = useMemo(() => {
    const windowMs = Math.max(0, dedupeWindowSeconds) * 1000;
    const byKey = new Map<string, EventRow[]>();
    events.forEach((event) => {
      const key = [
        event.event_type,
        event.team,
        event.player_id,
        event.context,
        event.quarter
      ].join('|');
      const list = byKey.get(key) ?? [];
      list.push(event);
      byKey.set(key, list);
    });
    const toMs = (event: EventRow) => {
      if (event.event_elapsed_game_seconds !== null && event.event_elapsed_game_seconds !== undefined) {
        return event.event_elapsed_game_seconds * 1000;
      }
      const parsed = Date.parse(event.occurred_at);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    const duplicates = new Set<string>();
    byKey.forEach((list) => {
      const sorted = [...list].sort((a, b) => toMs(a) - toMs(b));
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          const delta = toMs(sorted[j]) - toMs(sorted[i]);
          if (delta > windowMs) break;
          const a = sorted[i];
          const b = sorted[j];
          if (!a.created_by || !b.created_by || a.created_by !== b.created_by) {
            duplicates.add(b.id);
          }
        }
      }
    });
    return duplicates;
  }, [dedupeWindowSeconds, events]);

  const filteredEvents = useMemo(() => {
    let list =
      trackerFilter === 'all' ? events : events.filter((event) => event.created_by === trackerFilter);
    if (isAggregateView && hideDuplicates) {
      list = list.filter((event) => !duplicateEventIds.has(event.id));
    }
    return list;
  }, [duplicateEventIds, events, hideDuplicates, isAggregateView, trackerFilter]);

  const handleExportMarkers = () => {
    if (!isAdmin || events.length === 0) return;
    const fpsValue = Number.parseFloat(fps);
    const safeFps = Number.isNaN(fpsValue) ? 30 : fpsValue;
    const rows = events.map((event) => {
      const periodLabel = event.quarter === 5 ? 'OT' : `Q${event.quarter}`;
      const clockDisplay =
        event.clock_display ??
        (event.clock_ms ? `${periodLabel} ${formatClock(event.clock_ms)}` : periodLabel);
      const shotLabel = event.payload?.shot
        ? `${event.payload.shot.zone} ${event.payload.shot.outcome}`
        : '';
      const segment = event.video_segments ?? null;
      const isMapped = Boolean(segment && event.event_video_seconds !== null);
      const eventVideoSeconds = event.event_video_seconds ?? 0;
      const relativeSeconds = Math.max(0, eventVideoSeconds - preRollSeconds);
      const timecode = isMapped ? formatTimecode(relativeSeconds, safeFps) : '';
      const descriptionParts = [
        `Q${event.quarter}`,
        clockDisplay,
        `#${event.player_id}`,
        event.event_type,
        shotLabel,
        event.context || ''
      ].filter(Boolean);
      if (!isMapped) {
        descriptionParts.push('NO VIDEO AVAILABLE');
      }
      return {
        marker_name: `${event.event_type} #${event.player_id}`,
        description: descriptionParts.join(' • '),
        segment_index: segment?.segment_index ?? '',
        segment_label: segment?.label ?? '',
        segment_source_url: segment?.source_url ?? '',
        segment_relative_timecode: timecode,
        game_time: clockDisplay,
        event_elapsed_game_seconds: event.event_elapsed_game_seconds ?? ''
      };
    });
    const header = [
      'marker_name',
      'description',
      'segment_index',
      'segment_label',
      'segment_source_url',
      'segment_relative_timecode',
      'game_time',
      'event_elapsed_game_seconds'
    ];
    const csv = [header.join(','), ...rows.map((row) => header.map((key) => escapeCsv((row as any)[key])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'water-polo-markers.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const getMarkerColor = (eventType: string): string => {
    if (eventType === 'SHOT_GOAL') return 'Green';
    if (eventType.startsWith('SHOT_')) return 'Yellow';
    if (eventType === 'ASSIST') return 'Cyan';
    if (eventType.startsWith('TO_')) return 'Orange';
    if (eventType === 'STEAL' || eventType === 'BLOCK' || eventType === 'TIP') return 'Blue';
    if (eventType.includes('EXCLUSION')) return 'Red';
    return 'White';
  };

  const handleExportPremiereMarkers = () => {
    if (!isAdmin || events.length === 0) return;
    const fpsValue = Number.parseFloat(fps);
    const safeFps = Number.isNaN(fpsValue) ? 30 : fpsValue;
    const preRoll = 7;
    const postRoll = 3;
    const mapped = events
      .filter((event) => event.event_video_seconds !== null && !duplicateEventIds.has(event.id))
      .map((event) => {
        const videoSec = event.event_video_seconds ?? 0;
        const inSec = Math.max(0, videoSec - preRoll);
        const outSec = videoSec + postRoll;
        const periodLabel = event.quarter === 5 ? 'OT' : `Q${event.quarter}`;
        const shotLabel = event.payload?.shot
          ? ` ${event.payload.shot.zone} ${event.payload.shot.outcome}`
          : '';
        return {
          name: `${event.event_type} #${event.player_id}${shotLabel}`,
          in_timecode: formatTimecode(inSec, safeFps),
          out_timecode: formatTimecode(outSec, safeFps),
          duration_seconds: preRoll + postRoll,
          description: `${periodLabel} • #${event.player_id} • ${event.event_type}${shotLabel} • ${event.context || 'EVEN'}`,
          color: getMarkerColor(event.event_type),
          event_type: event.event_type,
          player: event.player_id,
          quarter: periodLabel,
          context: event.context || 'EVEN',
          in_seconds: inSec.toFixed(2),
          out_seconds: outSec.toFixed(2)
        };
      });
    if (mapped.length === 0) return;
    const header = [
      'name',
      'in_timecode',
      'out_timecode',
      'duration_seconds',
      'description',
      'color',
      'event_type',
      'player',
      'quarter',
      'context',
      'in_seconds',
      'out_seconds'
    ];
    const csv = [
      header.join(','),
      ...mapped.map((row) =>
        header.map((key) => escapeCsv((row as any)[key])).join(',')
      )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'premiere-markers.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRemapSegments = async () => {
    const targetGameId = gameIdParam ?? sessionInfo?.gameId;
    if (!isAdmin || !supabase || !targetGameId) return;
    setRemapping(true);
    setRemapResult(null);
    const { data, error } = await supabase.rpc('backfill_event_segments', {
      target_game_id: targetGameId
    });
    if (error) {
      setRemapResult(`Error: ${error.message}`);
    } else {
      setRemapResult(`Remapped ${data ?? 0} events to video segments.`);
      // Reload events to pick up new segment mappings
      const selectFields =
        'id, event_type, team, player_id, quarter, context, clock_ms, clock_display, event_elapsed_game_seconds, segment_id, event_video_seconds, status, audited_by, audited_at, audit_notes, updated_at, version, occurred_at, payload, created_by, video_segments(id, segment_index, label, source_url, source_type, segment_start_game_seconds)';
      let query = supabase.from('events').select(selectFields);
      if (gameIdParam) {
        query = query.eq('game_id', gameIdParam);
      } else if (sessionId) {
        query = query.eq('session_id', sessionId);
      }
      const { data: refreshed } = await query.order('occurred_at', { ascending: false });
      if (refreshed) {
        const normalized = (refreshed as unknown as EventRow[]).map((row) => {
          if (row.video_segments && Array.isArray(row.video_segments)) {
            return { ...row, video_segments: (row.video_segments as any)[0] ?? null };
          }
          return row;
        }) as EventRow[];
        setEvents(normalized);
      }
    }
    setRemapping(false);
  };

  const handleApplyDedupe = async () => {
    if (!isAdmin || !supabase || duplicateEventIds.size === 0) return;
    if (!user) return;
    const confirmed = window.confirm('Mark duplicate events as rejected?');
    if (!confirmed) return;
    const auditedAt = new Date().toISOString();
    const ids = Array.from(duplicateEventIds);
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      await supabase
        .from('events')
        .update({
          status: 'rejected',
          audit_notes: 'Auto-dedupe',
          audited_by: user.id,
          audited_at: auditedAt
        })
        .in('id', chunk);
    }
    setEvents((prev) =>
      prev.map((event) =>
        duplicateEventIds.has(event.id)
          ? {
              ...event,
              status: 'rejected',
              audit_notes: 'Auto-dedupe',
              audited_by: user.id,
              audited_at: auditedAt
            }
          : event
      )
    );
  };

  const handleFinalizeAndExport = async () => {
    if (!isAdmin || !supabase || !user) return;
    const exportGameId = gameIdParam ?? sessionInfo?.gameId;
    if (!exportGameId) return;
    const confirmed = window.confirm(
      'Finalize this game? Duplicates will be rejected and remaining events marked audited before export.'
    );
    if (!confirmed) return;
    setFinalizing(true);
    setError(null);
    const auditedAt = new Date().toISOString();
    const duplicateIds = Array.from(duplicateEventIds);
    const allIds = events.map((event) => event.id);
    const nonDuplicateIds = allIds.filter((id) => !duplicateEventIds.has(id));
    const chunkSize = 200;

    for (let i = 0; i < duplicateIds.length; i += chunkSize) {
      const chunk = duplicateIds.slice(i, i + chunkSize);
      await supabase
        .from('events')
        .update({
          status: 'rejected',
          audit_notes: 'Auto-dedupe',
          audited_by: user.id,
          audited_at: auditedAt
        })
        .in('id', chunk);
    }

    for (let i = 0; i < nonDuplicateIds.length; i += chunkSize) {
      const chunk = nonDuplicateIds.slice(i, i + chunkSize);
      await supabase
        .from('events')
        .update({
          status: 'audited',
          audit_notes: null,
          audited_by: user.id,
          audited_at: auditedAt
        })
        .in('id', chunk);
    }

    setEvents((prev) =>
      prev.map((event) => {
        if (duplicateEventIds.has(event.id)) {
          return {
            ...event,
            status: 'rejected',
            audit_notes: 'Auto-dedupe',
            audited_by: user.id,
            audited_at: auditedAt
          };
        }
        return {
          ...event,
          status: 'audited',
          audit_notes: null,
          audited_by: user.id,
          audited_at: auditedAt
        };
      })
    );

    await handleExportAuditedPackage({ includeAllStatuses: false });
    setFinalizing(false);
  };

  const handleExportAuditedPackage = async (options?: { includeAllStatuses?: boolean }) => {
    if (!isAdmin || !supabase) return;
    const exportGameId = gameIdParam ?? sessionInfo?.gameId;
    if (!exportGameId) return;
    setExporting(true);
    setError(null);
    const { data: gameRow, error: gameError } = await supabase
      .from('games')
      .select(
        'id, opponent_name, scheduled_at, location, created_at, updated_at, external_game_id, roster_snapshot'
      )
      .eq('id', exportGameId)
      .maybeSingle();
    if (gameError || !gameRow) {
      setError(gameError?.message ?? 'Unable to load game metadata.');
      setExporting(false);
      return;
    }

    let eventsQuery = supabase
      .from('events')
      .select(
        'id, game_id, session_id, player_id, event_type, quarter, context, team, clock_ms, clock_display, event_elapsed_game_seconds, segment_id, event_video_seconds, status, audited_by, audited_at, audit_notes, updated_at, version, occurred_at, created_by, payload'
      );
    if (gameIdParam) {
      eventsQuery = eventsQuery.eq('game_id', exportGameId);
    } else if (sessionId) {
      eventsQuery = eventsQuery.eq('session_id', sessionId);
    }
    const includeAll = options?.includeAllStatuses ?? exportAllStatuses;
    if (!includeAll) {
      eventsQuery = eventsQuery.eq('status', 'audited');
    }
    const { data: exportEvents, error: eventsError } = await eventsQuery.order('occurred_at', {
      ascending: true
    });
    if (eventsError) {
      setError(eventsError.message);
      setExporting(false);
      return;
    }

    const { data: segmentsData } = await supabase
      .from('video_segments')
      .select(
        'id, segment_index, segment_start_game_seconds, segment_end_game_seconds, label, source_type, source_url, notes, created_by, created_at'
      )
      .eq('game_id', exportGameId)
      .order('segment_index', { ascending: true });

    const rosterSnapshotRaw = Array.isArray(gameRow.roster_snapshot)
      ? (gameRow.roster_snapshot as Array<{
          id: string;
          number: string;
          name?: string | null;
          external_player_id?: string | null;
        }>)
      : [];
    const rosterSnapshot = [...rosterSnapshotRaw];
    const rosterMap = new Map<string, { id: string; number: string; name?: string | null; external_player_id?: string | null }>();
    rosterSnapshot.forEach((entry) => rosterMap.set(entry.number, entry));
    let rosterUpdated = false;
    const uniquePlayers = Array.from(
      new Set((exportEvents ?? []).map((event) => event.player_id).filter(Boolean))
    );
    uniquePlayers.forEach((playerNumber) => {
      if (!rosterMap.has(playerNumber)) {
        const id =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `player-${playerNumber}-${Date.now()}`;
        const entry = {
          id,
          number: playerNumber,
          name: null,
          external_player_id: null
        };
        rosterMap.set(playerNumber, entry);
        rosterSnapshot.push(entry);
        rosterUpdated = true;
      }
    });
    if (rosterUpdated) {
      await supabase
        .from('games')
        .update({ roster_snapshot: rosterSnapshot })
        .eq('id', exportGameId);
    }

    const playerIdByNumber = new Map(rosterSnapshot.map((entry) => [entry.number, entry.id]));
    const externalPlayerByNumber = new Map(
      rosterSnapshot.map((entry) => [entry.number, entry.external_player_id ?? null])
    );

    const packagePayload = {
      schema_version: '1.0',
      game: {
        id: gameRow.id,
        opponent_name: gameRow.opponent_name,
        scheduled_at: gameRow.scheduled_at,
        location: gameRow.location,
        created_at: gameRow.created_at,
        updated_at: gameRow.updated_at,
        external_game_id: gameRow.external_game_id ?? null,
        roster_snapshot: rosterSnapshot
      },
      video_segments: segmentsData ?? [],
      events: (exportEvents ?? []).map((event) => ({
        id: event.id,
        game_id: event.game_id,
        session_id: event.session_id,
        player_id: playerIdByNumber.get(event.player_id) ?? null,
        player_number: event.player_id,
        external_player_id: externalPlayerByNumber.get(event.player_id) ?? null,
        event_type: event.event_type,
        quarter: event.quarter,
        context: event.context,
        team: event.team,
        clock_display: event.clock_display ?? null,
        event_elapsed_game_seconds: event.event_elapsed_game_seconds ?? null,
        segment_id: event.segment_id ?? null,
        event_video_seconds: event.event_video_seconds ?? null,
        status: event.status ?? 'audited',
        audited_by: event.audited_by ?? null,
        audited_at: event.audited_at ?? null,
        audit_notes: event.audit_notes ?? null,
        updated_at: event.updated_at ?? null,
        version: event.version ?? null,
        created_by: event.created_by ?? null,
        occurred_at: event.occurred_at,
        payload: event.payload ?? null
      }))
    };

    const blob = new Blob([JSON.stringify(packagePayload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `game-package-${gameRow.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  if (!canUseSupabase) {
    return (
      <div className="flex w-full flex-1 flex-col gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Review</h2>
        <p className="text-slate-600">Supabase is not configured for this deployment.</p>
      </div>
    );
  }

  if (authLoading || profileLoading) {
    return (
      <div className="flex w-full flex-1 items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!sessionId && !gameIdParam) {
    return (
      <div className="flex w-full flex-1 flex-col gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Review Sessions</h2>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {loadingSessions ? (
          <p className="text-slate-600">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-slate-600">No sessions yet.</p>
        ) : (
          <div className="grid gap-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <div className="text-base font-semibold text-slate-900">
                    vs {session.games?.opponent_name ?? 'Opponent'}
                  </div>
                  <div className="text-sm text-slate-600">{session.role_scope}</div>
                </div>
                <Link
                  href={`/review?sessionId=${session.id}`}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
        {isAdmin ? (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-slate-900">Review by Game</h3>
            {games.length === 0 ? (
              <p className="text-sm text-slate-600">No games available.</p>
            ) : (
              <div className="mt-3 grid gap-3">
                {games.map((game) => (
                  <div
                    key={game.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div>
                      <div className="text-base font-semibold text-slate-900">
                        vs {game.opponent_name}
                      </div>
                      <div className="text-sm text-slate-600">
                        {new Date(game.scheduled_at).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <Link
                      href={`/review?gameId=${game.id}`}
                      className="min-h-[44px] rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700"
                    >
                      Aggregate
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  if (gameIdParam && !isAdmin) {
    return (
      <div className="flex w-full flex-1 items-center justify-center text-slate-500">
        Game aggregate review is available to super admins only.
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-slate-900">
          {isAggregateView ? 'Game Aggregate Review' : 'Review'}
        </h2>
        <span className="text-sm font-semibold text-slate-600">
          vs {sessionInfo?.opponent || '(Unknown)'}
        </span>
        {formattedSessionTime ? (
          <span className="text-xs text-slate-500">Session started {formattedSessionTime}</span>
        ) : null}
        {isAggregateView && isAdmin ? (
          <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold">Active trackers:</span>{' '}
            {activeTrackers.length === 0
              ? 'None detected'
              : activeTrackers
                  .map((tracker) => `${tracker.label} (${formatLastSeen(tracker.lastSeen)})`)
                  .join(', ')}
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {isAdmin ? (
        <div className="grid gap-3 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Export Markers
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                FPS
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={fps}
                  onChange={(event) => setFps(event.target.value)}
                >
                  <option value="23.976">23.976</option>
                  <option value="29.97">29.97</option>
                  <option value="30">30</option>
                  <option value="59.94">59.94</option>
                  <option value="60">60</option>
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Pre-roll (sec)
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  min={0}
                  value={preRollSeconds}
                  onChange={(event) => setPreRollSeconds(Number(event.target.value))}
                />
              </label>
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  className="min-h-[44px] w-full rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleExportMarkers}
                  disabled={events.length === 0}
                >
                  Export Markers
                </button>
                <button
                  type="button"
                  className="min-h-[44px] w-full rounded-lg border border-purple-300 bg-purple-50 px-4 text-sm font-semibold text-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleExportPremiereMarkers}
                  disabled={events.length === 0}
                >
                  Premiere Pro CSV
                </button>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Export Audited Package
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                <input
                  type="checkbox"
                  checked={exportAllStatuses}
                  onChange={(event) => setExportAllStatuses(event.target.checked)}
                />
                Include all statuses
              </label>
              <button
                type="button"
                className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => handleExportAuditedPackage()}
                disabled={exporting}
              >
                {exporting ? 'Exporting…' : 'Export JSON'}
              </button>
              {isAggregateView ? (
                <button
                  type="button"
                  className="min-h-[44px] rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleFinalizeAndExport}
                  disabled={finalizing}
                >
                  {finalizing ? 'Finalizing…' : 'Finalize & Export'}
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {isAdmin ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Video Segments
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <button
              type="button"
              className="min-h-[36px] rounded-lg border border-blue-300 bg-blue-50 px-3 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleRemapSegments}
              disabled={remapping || events.length === 0}
            >
              {remapping ? 'Remapping…' : 'Remap Events to Segments'}
            </button>
            <span className="text-xs text-slate-500">
              Re-links all events to video segments. Use after adding or adjusting segments.
            </span>
            {remapResult ? (
              <span className={`text-xs font-semibold ${remapResult.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
                {remapResult}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
      {isAggregateView && isAdmin ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Deduplication
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Window (sec)
              <input
                className="mt-1 w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                min={0}
                value={dedupeWindowSeconds}
                onChange={(event) => setDedupeWindowSeconds(Number(event.target.value))}
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              <input
                type="checkbox"
                checked={hideDuplicates}
                onChange={(event) => setHideDuplicates(event.target.checked)}
              />
              Hide duplicates
            </label>
            <div className="text-xs text-slate-500">
              Total: {events.length} · Duplicates: {duplicateEventIds.size} · Unique:{' '}
              {Math.max(0, events.length - duplicateEventIds.size)}
            </div>
            <button
              type="button"
              className="min-h-[36px] rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleApplyDedupe}
              disabled={duplicateEventIds.size === 0}
            >
              Mark duplicates as rejected
            </button>
          </div>
        </section>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span className="font-semibold">Filter:</span>
        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Tracker</label>
        <select
          className="min-h-[36px] rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
          value={trackerFilter}
          onChange={(event) => setTrackerFilter(event.target.value)}
        >
          <option value="all">All trackers</option>
          {trackerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">Potential duplicates are marked.</span>
      </div>
      {loadingEvents ? (
        <p className="text-slate-600">Loading events…</p>
      ) : filteredEvents.length === 0 ? (
        <p className="text-slate-600">No events logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[140px_1fr_110px_110px_110px_160px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <div>Time</div>
              <div>Event</div>
              <div>Team</div>
              <div>Player</div>
              <div>Context</div>
              <div>Logged by</div>
            </div>
            <div className="divide-y divide-slate-200">
              {filteredEvents.map((event) => {
                const periodLabel = event.quarter === 5 ? 'OT' : `Q${event.quarter}`;
                const timeLabel = event.clock_ms
                  ? `${periodLabel} ${formatClock(event.clock_ms)}`
                  : periodLabel;
                const shotLabel = event.payload?.shot
                  ? ` (${event.payload.shot.zone} ${event.payload.shot.outcome})`
                  : '';
                const contextValue = event.context ?? 'EVEN';
                const isDuplicate = duplicateEventIds.has(event.id);
                const segment = event.video_segments ?? null;
                const videoSeconds = event.event_video_seconds ?? null;
                const videoSecondsWithPreRoll =
                  videoSeconds !== null ? Math.max(0, videoSeconds - preRollSeconds) : null;
                const videoUrl =
                  isAdmin && segment?.source_url && videoSecondsWithPreRoll !== null
                    ? `${segment.source_url}${segment.source_url.includes('?') ? '&' : '?'}t=${videoSecondsWithPreRoll}s`
                    : null;
                return (
                  <div
                    key={event.id}
                    className={`grid grid-cols-[140px_1fr_110px_110px_110px_160px] items-center gap-2 px-4 py-3 text-sm text-slate-700 ${
                      isDuplicate ? 'bg-amber-50' : ''
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{timeLabel}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{event.event_type}</span>
                      {isDuplicate ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Potential duplicate
                        </span>
                      ) : null}
                      {shotLabel ? (
                        <span className="text-xs text-slate-500">{shotLabel}</span>
                      ) : null}
                      {videoUrl ? (
                        <a
                          className="text-xs font-semibold text-slate-700 underline"
                          href={videoUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Video
                        </a>
                      ) : null}
                    </div>
                    <div>{event.team}</div>
                    <div>#{event.player_id}</div>
                    <div className="text-xs font-semibold text-slate-600">{contextValue}</div>
                    <div className="text-xs font-semibold text-slate-600">
                      {trackerLabel(event.created_by, profile?.role === 'super_admin')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewPageContent />
    </Suspense>
  );
}
