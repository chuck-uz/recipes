export const UNIT_CODES = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'pinch', 'pcs', 'to_taste'] as const

export type Unit = (typeof UNIT_CODES)[number]

export interface Ingredient {
  id: string
  name: string
  amount?: number
  unit: Unit
  /** false — количество не пересчитывается при смене порций. По умолчанию true. */
  scalable?: boolean
}

export interface Step {
  id: string
  title: string
  text: string
  timerSec?: number
}

export interface Recipe {
  schemaVersion: number
  id: string
  version: number
  title: string
  description: string
  tags: string[]
  servings: number
  totalTimeMin: number
  ingredients: Ingredient[]
  steps: Step[]
  notes?: string
  createdAt: string
  updatedAt: string
  source?: string
}

export interface IndexEntry {
  id: string
  title: string
  tags: string[]
  totalTimeMin: number
  servings: number
  updatedAt: string
  file: string
  sha256: string
}

export interface RecipeIndex {
  schemaVersion: number
  generatedAt: string
  recipes: IndexEntry[]
}

export const SUPPORTED_SCHEMA_VERSION = 1
