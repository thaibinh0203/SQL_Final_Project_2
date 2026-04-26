"use client";

import { useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef
} from "@tanstack/react-table";
import type { AnyRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

interface DataTableProps<T extends AnyRecord> {
  columns: ColumnDef<T>[];
  data: T[];
  emptyText: string;
  className?: string;
}

export function DataTable<T extends AnyRecord>({ columns, data, emptyText, className }: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));
  const pageData = useMemo(() => data.slice(page * pageSize, page * pageSize + pageSize), [data, page, pageSize]);
  const table = useReactTable({
    data: pageData,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  useEffect(() => {
    setPage(0);
  }, [data, pageSize]);

  return (
    <div className={cn("overflow-hidden rounded-lg border border-line", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse bg-white text-sm">
          <thead className="bg-canvas text-left text-xs font-bold uppercase tracking-[0.5px] text-slate">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="border-b border-line px-4 py-3">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-canvas">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-top text-navy">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-slate" colSpan={columns.length}>
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data.length > pageSize || data.length > 10 ? (
        <div className="flex flex-col gap-3 border-t border-line bg-white px-4 py-3 text-sm text-slate sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {data.length ? page * pageSize + 1 : 0}-{Math.min(data.length, page * pageSize + pageSize)} of {data.length}
          </span>
          <div className="flex items-center gap-2">
            <Select className="h-9 w-24" value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </Select>
            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
              Prev
            </Button>
            <span className="font-mono text-xs">
              {page + 1}/{pageCount}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
