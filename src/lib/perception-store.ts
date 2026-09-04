import { createModel, PerceptionModel } from './perception-model'

const STORAGE_KEY = 'perception:workspace:v1'

export interface PerceptionWorkspace {
  version: 1
  ownerId: string
  activeGoalId: string
  models: PerceptionModel[]
  savedAt: string
}

const now = () => new Date().toISOString()

export function createWorkspace(seed = 'deer'): PerceptionWorkspace {
  const model = createModel(seed)
  return {
    version: 1,
    ownerId: 'local-user',
    activeGoalId: model.goal.id,
    models: [model],
    savedAt: now(),
  }
}

export function loadWorkspace(seed = 'deer'): PerceptionWorkspace {
  if (typeof window === 'undefined') return createWorkspace(seed)

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createWorkspace(seed)

    const parsed = JSON.parse(raw) as Partial<PerceptionWorkspace>
    if (parsed.version !== 1 || !Array.isArray(parsed.models) || parsed.models.length === 0) {
      return createWorkspace(seed)
    }

    const activeGoalId = parsed.models.some((model) => model.goal.id === parsed.activeGoalId)
      ? parsed.activeGoalId!
      : parsed.models[0].goal.id

    return {
      version: 1,
      ownerId: parsed.ownerId || 'local-user',
      activeGoalId,
      models: parsed.models,
      savedAt: parsed.savedAt || now(),
    }
  } catch {
    return createWorkspace(seed)
  }
}

export function saveWorkspace(workspace: PerceptionWorkspace): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...workspace, savedAt: now() }),
    )
  } catch {
    // Persistence failure must never interrupt the user's active Reality Route.
  }
}

export function getActiveModel(workspace: PerceptionWorkspace): PerceptionModel {
  return (
    workspace.models.find((model) => model.goal.id === workspace.activeGoalId) ??
    workspace.models[0]
  )
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

export function addProject(workspace: PerceptionWorkspace, topic: string): PerceptionWorkspace {
  const model = createModel(topic.trim() || 'Untitled idea')
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

export function clearWorkspace(seed = 'deer'): PerceptionWorkspace {
  const workspace = createWorkspace(seed)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // No-op: reset should still succeed in memory.
    }
  }
  return workspace
}
