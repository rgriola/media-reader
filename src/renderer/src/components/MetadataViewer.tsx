import React from 'react'
import { XMLMetadata } from '../types'

interface MetadataViewerProps {
  metadata: XMLMetadata
  title: string
}

export function MetadataViewer({ metadata, title }: MetadataViewerProps): React.ReactElement {
  const renderValue = (value: any, depth = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-gray-500 italic">null</span>
    }

    if (typeof value === 'boolean') {
      return <span className="text-yellow-400">{value.toString()}</span>
    }

    if (typeof value === 'number') {
      return <span className="text-green-400">{value}</span>
    }

    if (typeof value === 'string') {
      return <span className="text-blue-300">&quot;{value}&quot;</span>
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-gray-500">[]</span>
      }
      return (
        <div className="ml-4">
          {value.map((item, index) => (
            <div key={index} className="my-1">
              <span className="text-gray-400">[{index}]:</span> {renderValue(item, depth + 1)}
            </div>
          ))}
        </div>
      )
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value)
      if (entries.length === 0) {
        return <span className="text-gray-500">{'{}'}</span>
      }
      return (
        <div className={depth > 0 ? 'ml-4 border-l border-gray-700 pl-3 my-1' : ''}>
          {entries.map(([key, val]) => (
            <div key={key} className="my-1">
              <span className="text-purple-400 font-medium">{key}:</span>{' '}
              {renderValue(val, depth + 1)}
            </div>
          ))}
        </div>
      )
    }

    return <span className="text-gray-300">{String(value)}</span>
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
      <h3 className="text-lg font-semibold text-white mb-3 sticky top-0 bg-gray-900 pb-2 border-b border-gray-700">
        {title}
      </h3>

      {/* Quick Reference Section */}
      {!!(metadata.startTimecode || metadata.duration || metadata.frameRate) && (
        <div className="mb-4 p-3 bg-gray-800 rounded">
          <h4 className="text-sm font-semibold text-gray-400 mb-2">Quick Reference</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {metadata.startTimecode && (
              <div>
                <span className="text-gray-400">Timecode:</span>{' '}
                <span className="text-blue-300 font-mono">{metadata.startTimecode}</span>
              </div>
            )}
            {metadata.duration && (
              <div>
                <span className="text-gray-400">Duration:</span>{' '}
                <span className="text-blue-300 font-mono">{metadata.duration}</span>
              </div>
            )}
            {metadata.frameRate && (
              <div>
                <span className="text-gray-400">Frame Rate:</span>{' '}
                <span className="text-green-400">{metadata.frameRate}</span>
              </div>
            )}
            {metadata.resolution && (
              <div>
                <span className="text-gray-400">Resolution:</span>{' '}
                <span className="text-green-400">{metadata.resolution}</span>
              </div>
            )}
            {metadata.videoCodec && (
              <div>
                <span className="text-gray-400">Codec:</span>{' '}
                <span className="text-green-400">{metadata.videoCodec}</span>
              </div>
            )}
            {metadata.creationDate && (
              <div>
                <span className="text-gray-400">Created:</span>{' '}
                <span className="text-blue-300">{metadata.creationDate}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Complete XML Data */}
      {!!metadata.rawXML && (
        <div>
          <h4 className="text-sm font-semibold text-gray-400 mb-2">Complete XML Data</h4>
          <div className="font-mono text-xs bg-black rounded p-3 overflow-x-auto">
            {renderValue(metadata.rawXML)}
          </div>
        </div>
      )}

      {/* XML File Path */}
      {metadata.xmlFilePath && (
        <div className="mt-3 text-xs text-gray-500">
          <span className="font-semibold">Source:</span> {metadata.xmlFilePath}
        </div>
      )}
    </div>
  )
}
