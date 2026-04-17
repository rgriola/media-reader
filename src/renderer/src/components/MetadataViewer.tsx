import React from 'react'
import { XMLMetadata } from '../types'

interface MetadataViewerProps {
  metadata: XMLMetadata
  title: string
}

export function MetadataViewer({ metadata, title }: MetadataViewerProps): React.ReactElement {
  const renderValue = (value: any, depth = 0): React.ReactNode => {
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
      return (
        <div className="ml-4">
          {value.map((item, index) => (
            <div key={index} className="my-1">
              <span className="text-muted">[{index}]:</span> {renderValue(item, depth + 1)}
            </div>
          ))}
        </div>
      )
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value)
      if (entries.length === 0) {
        return <span className="text-muted">{'{}'}</span>
      }
      return (
        <div className={depth > 0 ? 'ml-4 border-l border-surface-border pl-3 my-1' : ''}>
          {entries.map(([key, val]) => (
            <div key={key} className="my-1">
              <span className="text-[#A855F7] font-bold">{key}:</span>{' '}
              {renderValue(val, depth + 1)}
            </div>
          ))}
        </div>
      )
    }

    return <span className="text-app-white">{String(value)}</span>
  }

  return (
    <div className="panel p-4 max-h-96 overflow-y-auto">
      <h3 className="text-subheader text-app-white mb-3 sticky top-0 bg-surface pb-2 border-b border-surface-border">
        {title}
      </h3>

      {/* Quick Reference Section */}
      {!!(metadata.startTimecode || metadata.duration || metadata.frameRate) && (
        <div className="mb-4 p-3 bg-surface-raised rounded">
          <h4 className="section-label mb-2">Quick Reference</h4>
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
        </div>
      )}

      {/* Complete XML Data */}
      {!!metadata.rawXML && (
        <div>
          <h4 className="section-label mb-2">Complete XML Data</h4>
          <div className="font-mono text-special bg-app-black rounded p-3 overflow-x-auto">
            {renderValue(metadata.rawXML)}
          </div>
        </div>
      )}

      {/* XML File Path */}
      {metadata.xmlFilePath && (
        <div className="mt-3 text-special text-muted">
          <span className="font-bold">Source:</span> {metadata.xmlFilePath}
        </div>
      )}
    </div>
  )
}
