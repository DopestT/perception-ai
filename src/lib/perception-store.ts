import { createModel, PerceptionModel } from './perception-model'
import type { FirstActionCycle } from './perception-flow'

const STORAGE_KEY = 'perception:workspace:v2'
const LEGACY_STORAGE_KEY = 'perception:workspace:v1'

export interface PerceptionWorkspace {
  version: 2
  ownerId: string
  activeGoalId: string
  models: PerceptionModel[]
  runtimeByGoalId: Record<string, FirstActionCycle | undefined>
  savedAt: string
}

const now = () => new Date().toISOString()

export function createWorkspace(seed = ''): PerceptionWorkspace {
  const model = createModel(seed)
  return {
    version: 2,
    ownerId: 'local-user',
    activeGoalId: model.goal.id,
    models: [model],
    runtimeByGoalId: {},
    savedAt: now(),
  }
}

function parseWorkspace(raw: string | null): PerceptionWorkspace | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PerceptionWorkspace> & { version?: number }
    if (!Array.isArray(parsed.models) || parsed.models.length === 0) return null

    const activeGoalId = parsed.models.some((model) => model.goal.id === parsed.activeGoalId)
      ? parsed.activeGoalId!
      : parsed.models[0].goal.id

    return {
      version: 2,
      ownerId: parsed.ownerId || 'local-user',
      activeGoalId,
      models: parsed.models,
      runtimeByGoalId: parsed.version === 2 && parsed.runtimeByGoalId ? parsed.runtimeByGoalId : {},
      savedAt: parsed.savedAt || now(),
    }
  } catch {
    return null
  }
}

export function loadWorkspace(seed = ''): PerceptionWorkspace {
  if (typeof window === 'undefined') return createWorkspace(seed)

  const current = parseWorkspace(window.localStorage.getItem(STORAGE_KEY))
  if (current) return current

  const migrated = parseWorkspace(window.localStorage.getItem(LEGACY_STORAGE_KEY))
  return migrated ?? createWorkspace(seed)
}

export function saveWorkspace(workspace: PerceptionWorkspace): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...workspace, savedAt: now() }))
  } catch {
    // Persistence failure must never interrupt the user's active Reality Route.
  }
}

export function getActiveModel(workspace: PerceptionWorkspace): PerceptionModel {
  return workspace.models.find((model) => model.goal.id === workspace.activeGoalId) ?? workspace.models[0]
}

export function getActiveRuntime(workspace: PerceptionWorkspace): FirstActionCycle | undefined {
  return workspace.runtimeByGoalId[workspace.activeGoalId]
}

export function updateActiveModel(
  workspace: PerceptionWorkspace,
  updater: (model: PerceptionModel) => PerceptionModel,
): PerceptionWorkspace {
  return {
    ...workspace,
    models: workspace.models.map((model) =>
      model.goal.id === workspace.activeGoalId ? updater(model) : model,
    ),
    savedAt: now(),
  }
}

export function setRuntimeCycle(
  workspace: PerceptionWorkspace,
  goalId: string,
  cycle: FirstActionCycle,
): PerceptionWorkspace {
  return {
    ...workspace,
    runtimeByGoalId: { ...workspace.runtimeByGoalId, [goalId]: cycle },
    savedAt: now(),
  }
}

export function addProject(workspace: PerceptionWorkspace, topic: string): PerceptionWorkspace {
  const model = createModel(topic.trim())
  return {
    ...workspace,
    activeGoalId: model.goal.id,
    models: [...workspace.models, model],
    savedAt: now(),
  }
}

export function switchProject(workspace: PerceptionWorkspace, goalId: string): PerceptionWorkspace {
  if (!workspace.models.some((model) => model.goal.id === goalId)) return workspace
  return { ...workspace, activeGoalId: goalId, savedAt: now() }
}

export function clearWorkspace(seed = ''): PerceptionWorkspace {
  const workspace = createWorkspace(seed)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
      window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // No-op: reset should still succeed in memory.
    }
  }
  return workspace
}
