"use client";

import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SITE_GLOBAL_CONFIG_REDIRECTS_TAG } from "@/lib/invalidate-site-redirect-cache";
import {
  findDuplicateRedirect,
  normalizeSourcePath,
} from "@/lib/redirects";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

type RedirectRow = {
  source: string;
  destination: string;
  status: number;
};

type GlobalConfigOption = {
  id: string;
  slug: string;
  digest: string;
  itemCount: number;
  updatedAt: number;
};

type ApiListResponse = {
  configured: boolean;
  redirects: RedirectRow[];
  digest: string | null;
  globalConfigId?: string | null;
  message?: string;
  error?: string;
};

type GlobalConfigsResponse = {
  configured: boolean;
  configs: GlobalConfigOption[];
  defaultGlobalConfigId: string | null;
  message?: string;
  error?: string;
};

const defaultForm = {
  source: "",
  destination: "",
  status: "301",
};

const fieldInputClassName =
  "w-full rounded-md border border-[var(--color-border)] px-3 py-2.5 text-base";

export function RedirectDashboard() {
  const [rows, setRows] = useState<RedirectRow[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<RedirectRow | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [globalConfigs, setGlobalConfigs] = useState<GlobalConfigOption[]>([]);
  const [selectedGlobalConfigId, setSelectedGlobalConfigId] = useState<
    string | null
  >(null);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearConfirmOpen, setCacheClearConfirmOpen] = useState(false);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const formSectionRef = useRef<HTMLElement>(null);
  const destinationInputRef = useRef<HTMLInputElement>(null);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(
      (row) =>
        row.source.toLowerCase().includes(query) ||
        row.destination.toLowerCase().includes(query),
    );
  }, [rows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const rangeStart =
    filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filteredRows.length);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const loadConfigs = useCallback(async () => {
    setConfigsLoading(true);
    try {
      const res = await fetch("/api/global-configs");
      const data = (await res.json()) as GlobalConfigsResponse;
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load Global Config list");
      }
      const configs = data.configs ?? [];
      setGlobalConfigs(configs);
      setSelectedGlobalConfigId(configs[0]?.id ?? null);

      if (!data.configured && data.message) {
        setError(data.message);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load Global Config list",
      );
    } finally {
      setConfigsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!selectedGlobalConfigId) {
      setRows([]);
      setConfigured(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/redirects?globalConfigId=${encodeURIComponent(selectedGlobalConfigId)}`,
      );
      const data = (await res.json()) as ApiListResponse;
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load redirects");
      }
      setConfigured(data.configured);
      setRows(data.redirects ?? []);
      if (!data.configured && data.message) {
        setError(data.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load redirects");
    } finally {
      setLoading(false);
    }
  }, [selectedGlobalConfigId]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    setForm(defaultForm);
    setEditingSource(null);
    setSearchQuery("");
  }, [selectedGlobalConfigId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!deleteCandidate && !duplicateNotice && !cacheClearConfirmOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !clearingCache) {
        setDeleteCandidate(null);
        setDuplicateNotice(null);
        setCacheClearConfirmOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteCandidate, duplicateNotice, cacheClearConfirmOpen, saving, clearingCache]);

  useEffect(() => {
    if (!editingSource) return;

    formSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    const focusTimer = window.setTimeout(() => {
      destinationInputRef.current?.focus({ preventScroll: true });
      destinationInputRef.current?.select();
    }, 150);

    return () => window.clearTimeout(focusTimer);
  }, [editingSource]);

  const resetForm = () => {
    setForm(defaultForm);
    setEditingSource(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const status = Number(form.status);
    const duplicate = findDuplicateRedirect(
      rows,
      form.source,
      form.destination,
      status,
    );

    if (duplicate) {
      const isUnchangedEdit =
        editingSource &&
        (duplicate.source === editingSource ||
          normalizeSourcePath(duplicate.source) ===
            normalizeSourcePath(editingSource));

      if (!editingSource || isUnchangedEdit) {
        setDuplicateNotice(duplicate);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/redirects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          globalConfigId: selectedGlobalConfigId,
          source: form.source,
          destination: form.destination,
          status: Number(form.status),
          ...(editingSource ? { previousSource: editingSource } : {}),
        }),
      });
      const data = (await res.json()) as ApiListResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save redirect");
      }
      setRows(data.redirects ?? []);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save redirect");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: RedirectRow) => {
    setEditingSource(row.source);
    setForm({
      source: row.source,
      destination: row.destination,
      status: "301",
    });
  };

  const clearRedirectsCache = async () => {
    setClearingCache(true);
    setCacheNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/redirects/revalidate-cache", {
        method: "POST",
      });
      const data = (await res.json()) as {
        revalidated?: boolean;
        tag?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to clear redirects cache");
      }
      setCacheNotice(
        `Cleared site cache tag ${data.tag ?? SITE_GLOBAL_CONFIG_REDIRECTS_TAG}.`,
      );
      setCacheClearConfirmOpen(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to clear redirects cache",
      );
    } finally {
      setClearingCache(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    const source = deleteCandidate;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/redirects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          globalConfigId: selectedGlobalConfigId,
        }),
      });
      const data = (await res.json()) as ApiListResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to delete redirect");
      }
      setRows(data.redirects ?? []);
      setDeleteCandidate(null);
      if (editingSource === source) {
        resetForm();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete redirect");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Redirect Manager</h1>
            <p className="text-[var(--color-muted-foreground)]">
              Choose a Vercel Global Config, then manage the{" "}
              <code className="text-xs">redirects</code> item.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCacheNotice(null);
              setCacheClearConfirmOpen(true);
            }}
            disabled={clearingCache || saving || cacheClearConfirmOpen}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm transition-colors hover:bg-amber-100 disabled:opacity-50"
            title={`Invalidate ${SITE_GLOBAL_CONFIG_REDIRECTS_TAG} on the site app`}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Purge redirects cache
          </button>
        </div>
        <div className="max-w-xl space-y-2">
          <label
            htmlFor="global-config-select"
            className="text-sm font-medium"
          >
            Global Config
          </label>
          <select
            id="global-config-select"
            className={fieldInputClassName}
            value={selectedGlobalConfigId ?? ""}
            onChange={(e) => setSelectedGlobalConfigId(e.target.value || null)}
            disabled={configsLoading || globalConfigs.length === 0}
          >
            {configsLoading ? (
              <option value="">Loading Global Configs…</option>
            ) : globalConfigs.length === 0 ? (
              <option value="">No Global Configs available</option>
            ) : (
              globalConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.slug}
                </option>
              ))
            )}
          </select>
        </div>
      </header>

      {cacheNotice ? (
        <div
          className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
          role="status"
        >
          {cacheNotice}
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section
        ref={formSectionRef}
        className="rounded-lg border border-[var(--color-border)] p-6 scroll-mt-4"
        aria-labelledby="redirect-form-heading"
      >
        <h2 id="redirect-form-heading" className="text-lg font-semibold">
          {editingSource ? "Edit redirect" : "Add redirect"}
        </h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_10rem_auto] lg:items-end"
          onSubmit={handleSubmit}
        >
          <label className="grid gap-1.5 text-sm sm:col-span-2 lg:col-span-1">
            <span className="font-medium">Source path</span>
            <input
              required
              className={fieldInputClassName}
              placeholder="/old-path"
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              disabled={!configured || saving || !selectedGlobalConfigId}
            />
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-2 lg:col-span-1">
            <span className="font-medium">Destination</span>
            <input
              ref={destinationInputRef}
              required
              className={fieldInputClassName}
              placeholder="/new-path or https://..."
              value={form.destination}
              onChange={(e) =>
                setForm((f) => ({ ...f, destination: e.target.value }))
              }
              disabled={!configured || saving || !selectedGlobalConfigId}
            />
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-1 lg:col-span-1">
            <span className="font-medium">Status</span>
            <select
              className={fieldInputClassName}
              value={form.status}
              disabled={!configured || saving || !selectedGlobalConfigId}
              aria-readonly
            >
              <option value="301">301 Permanent</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-1 lg:col-span-1 lg:items-end">
            <button
              type="submit"
              disabled={!configured || saving || !selectedGlobalConfigId}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] disabled:opacity-50"
            >
              {saving ? "Saving…" : editingSource ? "Update" : "Add"}
            </button>
            {editingSource ? (
              <button
                type="button"
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
                onClick={resetForm}
                disabled={saving}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
        {!selectedGlobalConfigId ? (
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
            Select a Global Config above. Set <code>VERCEL_API_TOKEN</code>{" "}
            (and <code>VERCEL_TEAM_ID</code> for team stores) to list configs
            and save changes.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-[var(--color-border)]">
        <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold">Existing redirects</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="redirect-search">
              Search source or destination
            </label>
            <input
              id="redirect-search"
              type="search"
              placeholder="Search source or destination…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={loading || rows.length === 0}
              className={`min-w-[14rem] flex-1 sm:min-w-[20rem] sm:flex-none ${fieldInputClassName}`}
            />
            <button
              type="button"
              className="text-sm text-[var(--color-muted-foreground)] underline"
              onClick={() => void load()}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-[var(--color-muted-foreground)]">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted-foreground)]">
            No redirects in this store yet.
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted-foreground)]">
            No redirects match &ldquo;{searchQuery.trim()}&rdquo;.
          </p>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Destination</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="min-w-[11rem] px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.source}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="px-4 py-2 font-mono text-xs md:text-sm">
                      {row.source}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs md:text-sm">
                      {row.destination}
                    </td>
                    <td className="px-4 py-2">{row.status}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <div className="inline-flex flex-nowrap items-center gap-3">
                        <button
                          type="button"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-100 disabled:opacity-50"
                          onClick={() => startEdit(row)}
                          disabled={saving}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-red-300 bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
                          onClick={() => setDeleteCandidate(row.source)}
                          disabled={saving}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className="flex flex-col gap-3 border-t border-[var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Showing {rangeStart}–{rangeEnd} of {filteredRows.length}
              {searchQuery.trim() ? ` (filtered from ${rows.length})` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-[var(--color-muted-foreground)]">
                  Page size
                </span>
                <select
                  className="rounded-md border border-[var(--color-border)] px-2 py-1"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  disabled={loading || saving}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-sm text-[var(--color-muted-foreground)]">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm disabled:opacity-50"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || loading || saving}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm disabled:opacity-50"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || loading || saving}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
          </>
        )}
      </section>
    </div>

    {duplicateNotice ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          aria-label="Close dialog"
          onClick={() => setDuplicateNotice(null)}
        />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="duplicate-dialog-title"
          aria-describedby="duplicate-dialog-description"
          className="relative z-10 w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg"
        >
          <h2 id="duplicate-dialog-title" className="text-lg font-semibold">
            Redirect already exists
          </h2>
          <p
            id="duplicate-dialog-description"
            className="mt-2 text-sm text-[var(--color-muted-foreground)]"
          >
            This redirect is already in the map with the same source,
            destination, and status. Change at least one field to save, or edit
            the existing entry from the table.
          </p>
          <dl className="mt-4 space-y-2 rounded-md bg-[var(--color-muted)] p-3 text-sm">
            <div>
              <dt className="font-medium text-[var(--color-muted-foreground)]">
                Source
              </dt>
              <dd className="font-mono text-xs">{duplicateNotice.source}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--color-muted-foreground)]">
                Destination
              </dt>
              <dd className="font-mono text-xs break-all">
                {duplicateNotice.destination}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--color-muted-foreground)]">
                Status
              </dt>
              <dd>{duplicateNotice.status}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
              onClick={() => setDuplicateNotice(null)}
            >
              OK
            </button>
            <button
              type="button"
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)]"
              onClick={() => {
                startEdit(duplicateNotice);
                setDuplicateNotice(null);
              }}
            >
              Edit existing
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {cacheClearConfirmOpen ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          aria-label="Close dialog"
          disabled={clearingCache}
          onClick={() => setCacheClearConfirmOpen(false)}
        />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cache-clear-dialog-title"
          aria-describedby="cache-clear-dialog-description"
          className="relative z-10 w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg"
        >
          <h2 id="cache-clear-dialog-title" className="text-lg font-semibold">
            Purge redirects cache?
          </h2>
          <p
            id="cache-clear-dialog-description"
            className="mt-2 text-sm text-[var(--color-muted-foreground)]"
          >
            This will purge the global redirects cache.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-amber-400 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
              disabled={clearingCache}
              onClick={() => void clearRedirectsCache()}
            >
              <RefreshCw
                className={`h-4 w-4 ${clearingCache ? "animate-spin" : ""}`}
                aria-hidden
              />
              {clearingCache ? "Purging…" : "Purge cache"}
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
              disabled={clearingCache}
              onClick={() => setCacheClearConfirmOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {deleteCandidate ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          aria-label="Close dialog"
          disabled={saving}
          onClick={() => setDeleteCandidate(null)}
        />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-description"
          className="relative z-10 w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg"
        >
          <h2 id="delete-dialog-title" className="text-lg font-semibold">
            Remove redirect?
          </h2>
          <p
            id="delete-dialog-description"
            className="mt-2 text-sm text-[var(--color-muted-foreground)]"
          >
            This will delete the redirect for{" "}
            <code className="break-all text-[var(--color-foreground)]">
              {deleteCandidate}
            </code>{" "}
            from Global Config.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
              disabled={saving}
              onClick={() => setDeleteCandidate(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-[var(--color-destructive)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={saving}
              onClick={() => void confirmDelete()}
            >
              {saving ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
