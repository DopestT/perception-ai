import type { PlannedRouteNode } from './reality-planner.ts'

export type CapabilityAdapterKey = 'local-runtime' | 'github-operator'

export type CapabilityRouteStatus =
  | 'ready'
  | 'awaiting_permission'
  | 'needs_action_contract'
  | 'blocked'

export type CapabilityRouteDecision = {
  nodeKey: string
  capability: PlannedRouteNode['capability']
  permissionLevel: PlannedRouteNode['permissionLevel']
  adapter: CapabilityAdapterKey | null
  executionMode: 'local' | 'external'
  status: CapabilityRouteStatus
  permissionRequired: boolean
  requiredInputFields: string[]
  blockers: string[]
}

export type CapabilityRouterOptions = {
  githubOperatorAttached?: boolean
}

const localCapabilities = new Set<PlannedRouteNode['capability']>([
  'reason',
  'generate',
  'verify',
])

export function routeCapabilityNode(
  node: PlannedRouteNode,
  options: CapabilityRouterOptions = {},
): CapabilityRouteDecision {
  const permissionRequired = node.permissionLevel === 'P2' || node.permissionLevel === 'P3'
  const blockers = node.blocker ? [node.blocker] : []

  if (blockers.length > 0) {
    return {
      nodeKey: node.key,
      capability: node.capability,
      permissionLevel: node.permissionLevel,
      adapter: null,
      executionMode: localCapabilities.has(node.capability) ? 'local' : 'external',
      status: 'blocked',
      permissionRequired,
      requiredInputFields: [],
      blockers,
    }
  }

  if (localCapabilities.has(node.capability)) {
    return {
      nodeKey: node.key,
      capability: node.capability,
      permissionLevel: node.permissionLevel,
      adapter: 'local-runtime',
      executionMode: 'local',
      status: permissionRequired ? 'awaiting_permission' : 'ready',
      permissionRequired,
      requiredInputFields: [],
      blockers: permissionRequired ? ['Scoped permission grant is required before execution.'] : [],
    }
  }

  if (node.capability === 'code') {
    if (!options.githubOperatorAttached) {
      return {
        nodeKey: node.key,
        capability: node.capability,
        permissionLevel: node.permissionLevel,
        adapter: null,
        executionMode: 'external',
        status: 'blocked',
        permissionRequired,
        requiredInputFields: [],
        blockers: ['No code execution adapter is attached to this runtime.'],
      }
    }

    if (node.permissionLevel === 'P3') {
      return {
        nodeKey: node.key,
        capability: node.capability,
        permissionLevel: node.permissionLevel,
        adapter: null,
        executionMode: 'external',
        status: 'blocked',
        permissionRequired: true,
        requiredInputFields: [],
        blockers: [
          'GitHub Operator v1 is limited to bounded repository changes and may not perform production deployment.',
          'A dedicated P3 deployment adapter and explicit authorization are required.',
        ],
      }
    }

    return {
      nodeKey: node.key,
      capability: node.capability,
      permissionLevel: node.permissionLevel,
      adapter: 'github-operator',
      executionMode: 'external',
      status: 'needs_action_contract',
      permissionRequired,
      requiredInputFields: [
        'project_id',
        'repository',
        'base_branch',
        'branch',
        'summary',
        'files',
      ],
      blockers: [
        'A concrete GitHub action contract must be resolved before execution.',
        ...(permissionRequired ? ['A matching scoped permission grant must be active before execution.'] : []),
      ],
    }
  }

  return {
    nodeKey: node.key,
    capability: node.capability,
    permissionLevel: node.permissionLevel,
    adapter: null,
    executionMode: 'external',
    status: 'blocked',
    permissionRequired,
    requiredInputFields: [],
    blockers: [`No adapter is attached for capability: ${node.capability}.`],
  }
}

export function routePlannedCapabilities(
  nodes: PlannedRouteNode[],
  options: CapabilityRouterOptions = {},
): CapabilityRouteDecision[] {
  return nodes.map((node) => routeCapabilityNode(node, options))
}
