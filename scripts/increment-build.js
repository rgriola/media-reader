#!/usr/bin/env node

/**
 * Increments the build number in package.json before building
 */

const fs = require('fs')
const path = require('path')

const packagePath = path.join(__dirname, '..', 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

// Get current build number or start at 1
const currentBuild = packageJson.buildNumber || 0
const newBuild = currentBuild + 1

// Update build number
packageJson.buildNumber = newBuild

// Update version to include build number (e.g., 1.0.0-build.123)
const baseVersion = packageJson.version.split('-')[0] // Get base version without build suffix
packageJson.version = `${baseVersion}-build.${newBuild}`

// Write back to package.json
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n')

console.log(`✅ Build number incremented: ${currentBuild} → ${newBuild}`)
console.log(`📦 Version: ${packageJson.version}`)
