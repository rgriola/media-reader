import React, { useState, useCallback } from 'react'
import { XMLMetadata } from '../types'
import { Accordion } from './metadata/Accordion'

// ─── CollapsibleNode ──────────────────────────────────────────

function CollapsibleNode({
  summary,
  defaultOpen,
  children
}: {
  summary: string
  defaultOpen: boolean
  children: React.ReactNode
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-0.5 text-muted/60 hover:text-muted transition-colors"
      >
        <span
          className={`inline-block transition-transform duration-100 text-special ${open ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
        <span className="ml-0.5 font-mono text-special">{summary}</span>
      </button>
      {open && children}
    </span>
  )
}

// ─── MetadataViewer ──────────────────────────────────────────

interface MetadataViewerProps {
  metadata: XMLMetadata
}

export function MetadataViewer({ metadata }: MetadataViewerProps): React.ReactElement {
  const [expandAll, setExpandAll] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyJSON = useCallback((): void => {
    navigator.clipboard.writeText(JSON.stringify(metadata.rawXML, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [metadata.rawXML])

  const handleToggleExpand = useCallback((): void => {
    setExpandAll((e) => !e)
  }, [])

  const renderValue = (value: unknown, depth = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-muted italic">null</span>
    }

    if (typeof value === 'boolean') {
      return <span className="text-warning">{value.toString()}</span>
    }

    if (typeof value === 'number') {
      return <span className="text-success">{value}</span>
    }

    if (typeof value === 'string') {
      return <span className="text-accent">&quot;{value}&quot;</span>
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-muted">[]</span>
      }
      const inner = (
        <div className="ml-4">
          {value.map((item, index) => (
            <div key={index} className="my-1">
              <span className="text-muted">[{index}]:</span> {renderValue(item, depth + 1)}
            </div>
          ))}
        </div>
      )
      if (depth >= 2) {
        return (
          <CollapsibleNode summary={`[${value.length}]`} defaultOpen={expandAll}>
            {inner}
          </CollapsibleNode>
        )
      }
      return inner
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
      if (entries.length === 0) {
        return <span className="text-muted">{'{}'}</span>
      }
      const inner = (
        <div className={depth > 0 ? 'ml-4 border-l border-surface-border pl-3 my-1' : ''}>
          {entries.map(([key, val]) => (
            <div key={key} className="my-1">
              <span className="meta-key">{key}:</span> {renderValue(val, depth + 1)}
            </div>
          ))}
        </div>
      )
      if (depth >= 2) {
        return (
          <CollapsibleNode summary={`{ ${entries.length} }`} defaultOpen={expandAll}>
            {inner}
          </CollapsibleNode>
        )
      }
      return inner
    }

    return <span className="text-app-white">{String(value)}</span>
  }

  return (
    <div className="space-y-2">
      {/* Quick Reference */}
      {!!(metadata.startTimecode || metadata.duration || metadata.frameRate) && (
        <Accordion title="Quick Reference" defaultOpen accent="blue">
          <div className="grid grid-cols-2 gap-2 text-body">
            {metadata.startTimecode && (
              <div>
                <span className="text-muted">Timecode:</span>{' '}
                <span className="card-value-accent">{metadata.startTimecode}</span>
              </div>
            )}
            {metadata.duration && (
              <div>
                <span className="text-muted">Duration:</span>{' '}
                <span className="card-value-accent">{metadata.duration}</span>
              </div>
            )}
            {metadata.frameRate && (
              <div>
                <span className="text-muted">Frame Rate:</span>{' '}
                <span className="card-value">{metadata.frameRate}</span>
              </div>
            )}
            {metadata.resolution && (
              <div>
                <span className="text-muted">Resolution:</span>{' '}
                <span className="card-value">{metadata.resolution}</span>
              </div>
            )}
            {metadata.videoCodec && (
              <div>
                <span className="text-muted">Codec:</span>{' '}
                <span className="card-value">{metadata.videoCodec}</span>
              </div>
            )}
            {metadata.creationDate && (
              <div>
                <span className="text-muted">Created:</span>{' '}
                <span className="card-value">{metadata.creationDate}</span>
              </div>
            )}
          </div>
        </Accordion>
      )}

      {/* Raw XML tree with controls (merged into outer Complete XML accordion) */}
      {!!metadata.rawXML && (
        <div className="space-y-2">
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={handleToggleExpand}
              className="px-2 py-0.5 rounded text-special bg-surface-raised hover:bg-surface-border text-muted hover:text-app-white transition-colors"
            >
              {expandAll ? 'Collapse All' : 'Expand All'}
            </button>
            <button
              type="button"
              onClick={handleCopyJSON}
              className="px-2 py-0.5 rounded text-special bg-surface-raised hover:bg-surface-border text-muted hover:text-app-white transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy JSON'}
            </button>
          </div>

          {/* key forces full remount of the tree when expandAll flips, resetting all node states */}
          <div
            key={String(expandAll)}
            className="font-mono text-special bg-app-black rounded p-3 overflow-x-auto"
          >
            {renderValue(metadata.rawXML)}
          </div>
        </div>
      )}

      {/* XML File Path */}
      {metadata.xmlFilePath && (
        <div className="pt-1 item-meta">
          <span className="font-bold text-muted">Source:</span> {metadata.xmlFilePath}
        </div>
      )}
    </div>
  )
}
