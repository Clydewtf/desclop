import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import type { ChecklistItem, Task } from "../../shared/domain/types";
import type { PlanFrame, PlannerFrame } from "./plannerEngine";
import {
  DEFAULT_PLANNER_VIEW_STATE,
  readPlannerViewState,
  writePlannerViewState,
  type PlannerViewState
} from "./plannerViewState";
import {
  Button,
  InlineAlert,
  ScreenHeader,
  SelectField,
  TaskStatusBadge,
  TextArea,
  TextField
} from "../../shared/ui";

export interface PlanEditorChecklistItemDraft {
  id: string;
  title: string;
  description: string;
  isNew: boolean;
}

export interface PlanEditorTaskDraft {
  id: string;
  title: string;
  description: string;
  isNew: boolean;
  checklist: PlanEditorChecklistItemDraft[];
}

export interface PlanEditorStageDraft {
  id: string;
  title: string;
  description: string;
  isNew: boolean;
  tasks: PlanEditorTaskDraft[];
}

export interface PlanEditorDraft {
  planId: string;
  title: string;
  stages: PlanEditorStageDraft[];
  deletedStageIds: string[];
  deletedTaskIds: string[];
  confirmedTaskDeletionIds: string[];
  deletedChecklistItemIds: string[];
  confirmedChecklistItemIds: string[];
}

export interface PlanEditorLeaveRequest {
  id: number;
}

export type PlanEditorLeaveResolution = "save" | "discard" | "stay";

interface PlannerProps {
  frames?: PlannerFrame[];
  planFrames?: PlanFrame[];
  projectId?: string;
  archivedPlanIds?: string[];
  onArchivePlan?: (planId: string) => void;
  onRestorePlan?: (planId: string) => void;
  onSavePlan?: (draft: PlanEditorDraft) => Promise<void>;
  onEditPlanDirtyChange?: (hasUnsavedChanges: boolean) => void;
  leaveRequest?: PlanEditorLeaveRequest | null;
  onResolveLeaveRequest?: (
    requestId: number,
    resolution: PlanEditorLeaveResolution
  ) => void;
  activeTaskId?: string | null;
  onOpenTask: (taskId: string, options: { activate: boolean }) => void;
}

interface EditPlanConfirmation {
  planId: string;
  action: "save" | "discard" | "leave" | "delete-task" | "delete-checklist-item";
  taskId?: string;
  checklistItemId?: string;
  leaveRequestId?: number;
}

interface StagePointerDrag {
  stageId: string;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  active: boolean;
  insertionIndex: number;
  latestClientX: number;
  latestClientY: number;
  frameRequestId: number | null;
  dropTargetStageId: string | null;
  listeners: {
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
    cancel: (event: PointerEvent) => void;
    blur: () => void;
  };
}

interface StageDragPreview {
  stageId: string;
  width: number;
  height: number;
  insertionIndex: number;
}

type PlanEditorStageListItem =
  | {
      kind: "stage";
      stage: PlanEditorStageDraft;
    }
  | {
      kind: "placeholder";
      stageId: string;
      height: number;
    };

export function Planner({
  frames = [],
  planFrames,
  projectId,
  archivedPlanIds = [],
  onArchivePlan,
  onRestorePlan,
  onSavePlan,
  onEditPlanDirtyChange,
  leaveRequest = null,
  onResolveLeaveRequest,
  activeTaskId = null,
  onOpenTask
}: PlannerProps) {
  const [viewState, setViewState] = useState<PlannerViewState>(() =>
    readCurrentPlannerViewState(projectId)
  );
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<PlanEditorDraft | null>(null);
  const [editingBaseline, setEditingBaseline] = useState<PlanEditorDraft | null>(null);
  const [focusPlanId, setFocusPlanId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<EditPlanConfirmation | null>(null);
  const [validationFieldId, setValidationFieldId] = useState<string | null>(null);
  const [stageDeleteWarningId, setStageDeleteWarningId] = useState<string | null>(null);
  const [taskDeleteWarning, setTaskDeleteWarning] = useState<{
    taskId: string;
    message: string;
  } | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dropTargetStageId, setDropTargetStageId] = useState<string | null>(null);
  const [keyboardGrabbedStageId, setKeyboardGrabbedStageId] = useState<string | null>(null);
  const [stageDragPreview, setStageDragPreview] = useState<StageDragPreview | null>(null);
  const [collapsedEditorTaskIds, setCollapsedEditorTaskIds] = useState<string[]>([]);
  const [collapsedEditorChecklistTaskIds, setCollapsedEditorChecklistTaskIds] = useState<string[]>([]);
  const editPlanButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const confirmationStayButtonRef = useRef<HTMLButtonElement | null>(null);
  const editingDraftRef = useRef<PlanEditorDraft | null>(null);
  const stageListRef = useRef<HTMLDivElement | null>(null);
  const stageCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const stagePositionRefs = useRef<Record<string, number>>({});
  const stageAnimationRefs = useRef<Record<string, Animation>>({});
  const skipStageAnimationRef = useRef<string | null>(null);
  const stagePointerDragRef = useRef<StagePointerDrag | null>(null);
  const draftStageSequence = useRef(0);
  const draftTaskSequence = useRef(0);
  const draftChecklistSequence = useRef(0);
  const handledLeaveRequestIdRef = useRef<number | null>(null);

  const hasUnsavedChanges =
    editingDraft !== null &&
    editingBaseline !== null &&
    !arePlanEditorDraftsEqual(editingDraft, editingBaseline);

  useEffect(() => {
    editingDraftRef.current = editingDraft;
  }, [editingDraft]);

  useEffect(() => {
    onEditPlanDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onEditPlanDirtyChange]);

  useEffect(() => {
    return () => onEditPlanDirtyChange?.(false);
  }, [onEditPlanDirtyChange]);

  useLayoutEffect(() => {
    const previousPositions = stagePositionRefs.current;
    const nextPositions: Record<string, number> = {};

    for (const stage of editingDraft?.stages ?? []) {
      const element = stageCardRefs.current[stage.id];
      if (!element) {
        continue;
      }

      const isPointerDragged = stageDragPreview?.stageId === stage.id;
      if (stageDragPreview && !isPointerDragged) {
        stageAnimationRefs.current[stage.id]?.cancel();
        delete stageAnimationRefs.current[stage.id];
      }

      const currentTop = element.getBoundingClientRect().top;
      nextPositions[stage.id] = currentTop;
      const previousTop = previousPositions[stage.id];
      if (
        previousTop === undefined ||
        Math.abs(previousTop - currentTop) < 1 ||
        isPointerDragged ||
        skipStageAnimationRef.current === stage.id ||
        typeof element.animate !== "function"
      ) {
        continue;
      }

      stageAnimationRefs.current[stage.id]?.cancel();
      const animation = element.animate(
        [
          { transform: `translateY(${previousTop - currentTop}px)` },
          { transform: "translateY(0)" }
        ],
        {
          duration: 180,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)"
        }
      );
      stageAnimationRefs.current[stage.id] = animation;
      animation.onfinish = () => {
        if (stageAnimationRefs.current[stage.id] === animation) {
          delete stageAnimationRefs.current[stage.id];
        }
      };
    }

    stagePositionRefs.current = nextPositions;
    skipStageAnimationRef.current = null;
  }, [
    editingDraft?.stages,
    stageDragPreview?.insertionIndex,
    stageDragPreview?.stageId
  ]);

  useEffect(() => {
    cancelStagePointerDrag();
    editingDraftRef.current = null;
    setViewState(readCurrentPlannerViewState(projectId));
    setEditingPlanId(null);
    setEditingDraft(null);
    setEditingBaseline(null);
    setFocusPlanId(null);
    setPendingConfirmation(null);
    setValidationFieldId(null);
    setStageDeleteWarningId(null);
    setTaskDeleteWarning(null);
    setEditorError(null);
    setSavingPlan(false);
    setDraggedStageId(null);
    setDropTargetStageId(null);
    setKeyboardGrabbedStageId(null);
    setCollapsedEditorTaskIds([]);
    setCollapsedEditorChecklistTaskIds([]);
    handledLeaveRequestIdRef.current = null;
  }, [projectId]);

  useEffect(() => {
    return () => {
      const drag = stagePointerDragRef.current;
      if (drag) {
        detachStagePointerListeners(drag);
      }
    };
  }, []);

  useEffect(() => {
    if (!focusPlanId) {
      return;
    }

    editPlanButtonRefs.current[focusPlanId]?.focus();
    setFocusPlanId(null);
  }, [focusPlanId]);

  function dismissPendingConfirmation() {
    const confirmation = pendingConfirmation;
    setPendingConfirmation(null);
    if (confirmation?.action === "leave" && confirmation.leaveRequestId !== undefined) {
      onResolveLeaveRequest?.(confirmation.leaveRequestId, "stay");
    }
  }

  useEffect(() => {
    if (!pendingConfirmation) {
      return;
    }

    confirmationStayButtonRef.current?.focus();

    function handleConfirmationKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissPendingConfirmation();
      }
    }

    window.addEventListener("keydown", handleConfirmationKeyDown);
    return () => window.removeEventListener("keydown", handleConfirmationKeyDown);
  }, [pendingConfirmation, onResolveLeaveRequest]);

  useEffect(() => {
    if (!validationFieldId) {
      return;
    }

    document.getElementById(validationFieldId)?.focus();
  }, [validationFieldId]);

  useEffect(() => {
    if (!leaveRequest || handledLeaveRequestIdRef.current === leaveRequest.id) {
      return;
    }

    handledLeaveRequestIdRef.current = leaveRequest.id;
    const planId = editingDraft?.planId ?? editingPlanId;
    if (!planId || !hasUnsavedChanges) {
      onResolveLeaveRequest?.(leaveRequest.id, "discard");
      return;
    }

    setPendingConfirmation({
      planId,
      action: "leave",
      leaveRequestId: leaveRequest.id
    });
  }, [
    editingDraft?.planId,
    editingPlanId,
    hasUnsavedChanges,
    leaveRequest,
    onResolveLeaveRequest
  ]);

  const renderedPlanFrames = planFrames ?? legacyPlanFrames(frames);
  const archivedIdSet = new Set(archivedPlanIds);
  const expandedPlanIds = new Set(viewState.expandedPlanIds);
  const collapsedPlanIds = new Set(viewState.collapsedPlanIds);
  const expandedStageIds = new Set(viewState.expandedStageIds);
  const collapsedStageIds = new Set(viewState.collapsedStageIds);
  const archivedPlanFrames = renderedPlanFrames.filter(
    (planFrame) => planFrame.collapsed && archivedIdSet.has(planFrame.plan.id)
  );
  const visiblePlanFrames = renderedPlanFrames
    .filter((planFrame) => !archivedIdSet.has(planFrame.plan.id) || !planFrame.collapsed)
    .sort(comparePlanFrames);
  const openPlanCount = renderedPlanFrames.filter((planFrame) => !planFrame.collapsed).length;
  const completedPlanCount = renderedPlanFrames.filter((planFrame) => planFrame.collapsed).length;
  const archivedPlanCount = archivedPlanFrames.length;

  function togglePlan(planFrame: PlanFrame) {
    updateViewState((current) => {
      const key = planFrame.collapsed ? "expandedPlanIds" : "collapsedPlanIds";
      return { ...current, [key]: toggleId(current[key], planFrame.plan.id) };
    });
  }

  function toggleStage(frame: PlannerFrame) {
    updateViewState((current) => {
      const key = frame.collapsed ? "expandedStageIds" : "collapsedStageIds";
      return { ...current, [key]: toggleId(current[key], frame.stage.id) };
    });
  }

  function isPlanCollapsed(planFrame: PlanFrame) {
    return planFrame.collapsed
      ? !expandedPlanIds.has(planFrame.plan.id)
      : collapsedPlanIds.has(planFrame.plan.id);
  }

  function isStageCollapsed(frame: PlannerFrame) {
    return frame.collapsed ? !expandedStageIds.has(frame.stage.id) : collapsedStageIds.has(frame.stage.id);
  }

  function updateViewState(update: (current: PlannerViewState) => PlannerViewState) {
    setViewState((current) => {
      const next = update(current);
      persistPlannerViewState(projectId, next);
      return next;
    });
  }

  function enterEditPlan(planId: string) {
    const planFrame = renderedPlanFrames.find((frame) => frame.plan.id === planId);
    if (!planFrame) {
      return;
    }

    cancelStagePointerDrag();
    const draft = makePlanEditorDraft(planFrame);
    editingDraftRef.current = draft;
    setEditingPlanId(planId);
    setEditingDraft(draft);
    setEditingBaseline(draft);
    setPendingConfirmation(null);
    setValidationFieldId(null);
    setStageDeleteWarningId(null);
    setTaskDeleteWarning(null);
    setEditorError(null);
    setDraggedStageId(null);
    setDropTargetStageId(null);
    setKeyboardGrabbedStageId(null);
    setCollapsedEditorTaskIds(
      draft.stages.flatMap((stage) => stage.tasks.map((task) => task.id))
    );
    setCollapsedEditorChecklistTaskIds(
      draft.stages.flatMap((stage) =>
        stage.tasks
          .filter((task) => task.checklist.length > 0)
          .map((task) => task.id)
      )
    );
  }

  function closeEditPlan(planId: string) {
    cancelStagePointerDrag();
    editingDraftRef.current = null;
    setEditingPlanId(null);
    setEditingDraft(null);
    setEditingBaseline(null);
    setValidationFieldId(null);
    setStageDeleteWarningId(null);
    setTaskDeleteWarning(null);
    setEditorError(null);
    setSavingPlan(false);
    setDraggedStageId(null);
    setDropTargetStageId(null);
    setKeyboardGrabbedStageId(null);
    setCollapsedEditorTaskIds([]);
    setCollapsedEditorChecklistTaskIds([]);
    setFocusPlanId(planId);
  }

  function requestExitEditPlan(planId: string) {
    if (hasUnsavedChanges) {
      setPendingConfirmation({ planId, action: "discard" });
      return;
    }

    closeEditPlan(planId);
  }

  function requestSaveEditPlan(planId: string) {
    if (!hasUnsavedChanges || savingPlan) {
      return;
    }

    setPendingConfirmation({ planId, action: "save" });
  }

  function updateEditingDraft(update: (draft: PlanEditorDraft) => PlanEditorDraft) {
    setEditingDraft((draft) => {
      const nextDraft = draft ? update(draft) : draft;
      editingDraftRef.current = nextDraft;
      return nextDraft;
    });
    setValidationFieldId(null);
    setStageDeleteWarningId(null);
    setTaskDeleteWarning(null);
    setEditorError(null);
  }

  function isEditorTaskCollapsed(taskId: string) {
    return collapsedEditorTaskIds.includes(taskId);
  }

  function isEditorChecklistCollapsed(taskId: string) {
    return collapsedEditorChecklistTaskIds.includes(taskId);
  }

  function toggleEditorTask(taskId: string) {
    setCollapsedEditorTaskIds((current) => toggleId(current, taskId));
  }

  function toggleEditorChecklist(taskId: string) {
    setCollapsedEditorChecklistTaskIds((current) => toggleId(current, taskId));
  }

  function updatePlanTitle(title: string) {
    updateEditingDraft((draft) => ({ ...draft, title }));
  }

  function updateStageDraft(
    stageId: string,
    update: (stage: PlanEditorStageDraft) => PlanEditorStageDraft
  ) {
    updateEditingDraft((draft) => ({
      ...draft,
      stages: draft.stages.map((stage) =>
        stage.id === stageId ? update(stage) : stage
      )
    }));
  }

  function addStageToDraft() {
    draftStageSequence.current += 1;
    const stageId = `draft-stage-${draftStageSequence.current}`;
    updateEditingDraft((draft) => ({
      ...draft,
      stages: [
        ...draft.stages,
        { id: stageId, title: "New stage", description: "", isNew: true, tasks: [] }
      ]
    }));
  }

  function updateTaskDraft(
    taskId: string,
    update: (task: PlanEditorTaskDraft) => PlanEditorTaskDraft
  ) {
    updateEditingDraft((draft) => ({
      ...draft,
      stages: draft.stages.map((stage) => ({
        ...stage,
        tasks: stage.tasks.map((task) => (task.id === taskId ? update(task) : task))
      }))
    }));
  }

  function updateChecklistItemDraft(
    itemId: string,
    update: (item: PlanEditorChecklistItemDraft) => PlanEditorChecklistItemDraft
  ) {
    updateEditingDraft((draft) => ({
      ...draft,
      stages: draft.stages.map((stage) => ({
        ...stage,
        tasks: stage.tasks.map((task) => ({
          ...task,
          checklist: task.checklist.map((item) => (item.id === itemId ? update(item) : item))
        }))
      }))
    }));
  }

  function addTaskToDraft(stageId: string) {
    draftTaskSequence.current += 1;
    const taskId = `draft-task-${draftTaskSequence.current}`;
    setCollapsedEditorTaskIds((current) => current.filter((candidate) => candidate !== taskId));
    setCollapsedEditorChecklistTaskIds((current) =>
      current.filter((candidate) => candidate !== taskId)
    );
    updateStageDraft(stageId, (stage) => ({
      ...stage,
      tasks: [
        ...stage.tasks,
        { id: taskId, title: "New task", description: "", isNew: true, checklist: [] }
      ]
    }));
  }

  function addChecklistItemToDraft(taskId: string) {
    draftChecklistSequence.current += 1;
    const itemId = `draft-checklist-${draftChecklistSequence.current}`;
    setCollapsedEditorTaskIds((current) => current.filter((candidate) => candidate !== taskId));
    setCollapsedEditorChecklistTaskIds((current) =>
      current.filter((candidate) => candidate !== taskId)
    );
    updateTaskDraft(taskId, (task) => ({
      ...task,
      checklist: [
        ...task.checklist,
        { id: itemId, title: "New checklist item", description: "", isNew: true }
      ]
    }));
  }

  function moveTaskInDraft(taskId: string, offset: -1 | 1) {
    updateEditingDraft((draft) => {
      const stageIndex = draft.stages.findIndex((stage) =>
        stage.tasks.some((task) => task.id === taskId)
      );
      const stage = draft.stages[stageIndex];
      if (!stage) {
        return draft;
      }

      const currentIndex = stage.tasks.findIndex((task) => task.id === taskId);
      const targetIndex = currentIndex + offset;
      if (targetIndex < 0 || targetIndex >= stage.tasks.length) {
        return draft;
      }

      const tasks = [...stage.tasks];
      const [task] = tasks.splice(currentIndex, 1);
      tasks.splice(targetIndex, 0, task);
      return {
        ...draft,
        stages: draft.stages.map((candidate, index) =>
          index === stageIndex ? { ...candidate, tasks } : candidate
        )
      };
    });
  }

  function moveTaskToStage(taskId: string, destinationStageId: string) {
    updateEditingDraft((draft) => {
      const sourceStageIndex = draft.stages.findIndex((stage) =>
        stage.tasks.some((task) => task.id === taskId)
      );
      const destinationStageIndex = draft.stages.findIndex(
        (stage) => stage.id === destinationStageId
      );
      if (
        sourceStageIndex < 0 ||
        destinationStageIndex < 0 ||
        sourceStageIndex === destinationStageIndex
      ) {
        return draft;
      }

      const sourceStage = draft.stages[sourceStageIndex];
      const task = sourceStage.tasks.find((candidate) => candidate.id === taskId);
      if (!task) {
        return draft;
      }

      return {
        ...draft,
        stages: draft.stages.map((stage, index) => {
          if (index === sourceStageIndex) {
            return { ...stage, tasks: stage.tasks.filter((candidate) => candidate.id !== taskId) };
          }
          if (index === destinationStageIndex) {
            return { ...stage, tasks: [...stage.tasks, task] };
          }
          return stage;
        })
      };
    });
  }

  function moveChecklistItemInDraft(itemId: string, offset: -1 | 1) {
    updateEditingDraft((draft) => {
      let changed = false;
      const stages = draft.stages.map((stage) => ({
        ...stage,
        tasks: stage.tasks.map((task) => {
          const currentIndex = task.checklist.findIndex((item) => item.id === itemId);
          const targetIndex = currentIndex + offset;
          if (currentIndex < 0 || targetIndex < 0 || targetIndex >= task.checklist.length) {
            return task;
          }

          const checklist = [...task.checklist];
          const [item] = checklist.splice(currentIndex, 1);
          checklist.splice(targetIndex, 0, item);
          changed = true;
          return { ...task, checklist };
        })
      }));

      return changed ? { ...draft, stages } : draft;
    });
  }

  function removeTaskFromDraft(taskId: string, confirmedChecklistRemoval: boolean) {
    updateEditingDraft((draft) => {
      const task = findDraftTask(draft, taskId);
      if (!task) {
        return draft;
      }

      return {
        ...draft,
        stages: draft.stages.map((stage) => ({
          ...stage,
          tasks: stage.tasks.filter((candidate) => candidate.id !== taskId)
        })),
        deletedTaskIds: task.isNew ? draft.deletedTaskIds : [...draft.deletedTaskIds, task.id],
        confirmedTaskDeletionIds:
          task.isNew || !confirmedChecklistRemoval
            ? draft.confirmedTaskDeletionIds
            : appendUnique(draft.confirmedTaskDeletionIds, task.id)
      };
    });
  }

  function removeChecklistItemFromDraft(itemId: string, confirmed: boolean) {
    updateEditingDraft((draft) => {
      const item = findDraftChecklistItem(draft, itemId);
      if (!item) {
        return draft;
      }

      return {
        ...draft,
        stages: draft.stages.map((stage) => ({
          ...stage,
          tasks: stage.tasks.map((task) => ({
            ...task,
            checklist: task.checklist.filter((candidate) => candidate.id !== itemId)
          }))
        })),
        deletedChecklistItemIds: item.isNew
          ? draft.deletedChecklistItemIds
          : [...draft.deletedChecklistItemIds, item.id],
        confirmedChecklistItemIds:
          item.isNew || !confirmed
            ? draft.confirmedChecklistItemIds
            : appendUnique(draft.confirmedChecklistItemIds, item.id)
      };
    });
  }

  function requestDeleteTask(taskId: string, hasPersistedChecklist: boolean) {
    const draft = editingDraftRef.current;
    const task = draft ? findDraftTask(draft, taskId) : null;
    if (!draft || !task) {
      return;
    }

    if (!task.isNew && task.id === activeTaskId) {
      setTaskDeleteWarning({
        taskId,
        message: "Choose a new active task or clear it before deleting this task."
      });
      return;
    }

    if (!task.isNew && hasPersistedChecklist) {
      setPendingConfirmation({ planId: draft.planId, action: "delete-task", taskId });
      return;
    }

    removeTaskFromDraft(taskId, false);
  }

  function requestDeleteChecklistItem(itemId: string) {
    const draft = editingDraftRef.current;
    const item = draft ? findDraftChecklistItem(draft, itemId) : null;
    if (!draft || !item) {
      return;
    }

    if (item.isNew) {
      removeChecklistItemFromDraft(itemId, false);
      return;
    }

    setPendingConfirmation({
      planId: draft.planId,
      action: "delete-checklist-item",
      checklistItemId: itemId
    });
  }

  function moveStageInDraft(stageId: string, offset: -1 | 1) {
    updateEditingDraft((draft) => {
      const currentIndex = draft.stages.findIndex((stage) => stage.id === stageId);
      const targetIndex = currentIndex + offset;
      if (
        currentIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= draft.stages.length
      ) {
        return draft;
      }

      const stages = [...draft.stages];
      const [stage] = stages.splice(currentIndex, 1);
      stages.splice(targetIndex, 0, stage);
      return { ...draft, stages };
    });
  }

  function moveStageToIndex(stageId: string, targetIndex: number) {
    const draft = editingDraftRef.current;
    if (!draft) {
      return false;
    }

    const sourceIndex = draft.stages.findIndex((stage) => stage.id === stageId);
    if (sourceIndex < 0) {
      return false;
    }

    const stages = [...draft.stages];
    const [stage] = stages.splice(sourceIndex, 1);
    const insertionIndex = Math.max(0, Math.min(targetIndex, stages.length));
    if (sourceIndex === insertionIndex) {
      return false;
    }

    stages.splice(insertionIndex, 0, stage);
    const nextDraft = { ...draft, stages };
    editingDraftRef.current = nextDraft;
    setEditingDraft(nextDraft);
    return true;
  }

  function clearStageDragPresentation() {
    setDraggedStageId(null);
    setDropTargetStageId(null);
    setStageDragPreview(null);
  }

  function detachStagePointerListeners(drag: StagePointerDrag) {
    window.removeEventListener("pointermove", drag.listeners.move);
    window.removeEventListener("pointerup", drag.listeners.up);
    window.removeEventListener("pointercancel", drag.listeners.cancel);
    window.removeEventListener("blur", drag.listeners.blur);
  }

  function cancelStagePointerDrag() {
    const drag = stagePointerDragRef.current;
    if (!drag) {
      clearStageDragPresentation();
      return;
    }

    if (drag.frameRequestId !== null) {
      window.cancelAnimationFrame(drag.frameRequestId);
      drag.frameRequestId = null;
    }

    if (drag.active) {
      skipStageAnimationRef.current = drag.stageId;
    }

    detachStagePointerListeners(drag);
    stagePointerDragRef.current = null;
    clearStageDragPresentation();
  }

  function isInteractiveStageTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      Boolean(target.closest("button, input, textarea, select, a, [contenteditable='true']"))
    );
  }

  function getStageInsertionIndex(stageId: string, clientY: number) {
    const draft = editingDraftRef.current;
    if (!draft) {
      return null;
    }

    const remainingStages = draft.stages.filter((stage) => stage.id !== stageId);
    const targetIndex = remainingStages.findIndex((stage) => {
      const element = stageCardRefs.current[stage.id];
      if (!element) {
        return false;
      }

      const bounds = getStageLayoutBounds(element);
      return clientY < bounds.top + bounds.height / 2;
    });

    return targetIndex === -1 ? remainingStages.length : targetIndex;
  }

  function moveStageDragPreview(drag: StagePointerDrag, clientX: number, clientY: number) {
    const element = stageCardRefs.current[drag.stageId];
    if (!element) {
      return;
    }

    element.style.setProperty("--planner-stage-drag-x", `${clientX - drag.offsetX}px`);
    element.style.setProperty("--planner-stage-drag-y", `${clientY - drag.offsetY}px`);
  }

  function getStageLayoutBounds(element: HTMLElement) {
    const stageList = stageListRef.current;
    if (stageList && element.offsetParent === stageList && element.offsetHeight > 0) {
      const listBounds = stageList.getBoundingClientRect();
      return {
        top: listBounds.top + element.offsetTop - stageList.scrollTop,
        height: element.offsetHeight
      };
    }

    return element.getBoundingClientRect();
  }

  function syncStageDropTargetToPointer(drag: StagePointerDrag, clientY: number) {
    const draft = editingDraftRef.current;
    const insertionIndex = getStageInsertionIndex(drag.stageId, clientY);
    if (!draft || insertionIndex === null) {
      return;
    }

    const remainingStages = draft.stages.filter((stage) => stage.id !== drag.stageId);
    const targetStage =
      remainingStages[insertionIndex] ?? remainingStages[insertionIndex - 1] ?? null;
    if (drag.dropTargetStageId !== targetStage?.id) {
      drag.dropTargetStageId = targetStage?.id ?? null;
      setDropTargetStageId(drag.dropTargetStageId);
    }

    if (drag.insertionIndex !== insertionIndex) {
      drag.insertionIndex = insertionIndex;
      setStageDragPreview((preview) => {
        if (
          !preview ||
          preview.stageId !== drag.stageId ||
          preview.insertionIndex === insertionIndex
        ) {
          return preview;
        }

        return { ...preview, insertionIndex };
      });
    }
  }

  function scheduleStagePointerFrame(drag: StagePointerDrag) {
    if (drag.frameRequestId !== null) {
      return;
    }

    drag.frameRequestId = window.requestAnimationFrame(() => {
      drag.frameRequestId = null;
      if (stagePointerDragRef.current !== drag || !drag.active) {
        return;
      }

      moveStageDragPreview(drag, drag.latestClientX, drag.latestClientY);
      syncStageDropTargetToPointer(drag, drag.latestClientY);
    });
  }

  function flushStagePointerFrame(drag: StagePointerDrag) {
    if (drag.frameRequestId !== null) {
      window.cancelAnimationFrame(drag.frameRequestId);
      drag.frameRequestId = null;
    }

    moveStageDragPreview(drag, drag.latestClientX, drag.latestClientY);
    syncStageDropTargetToPointer(drag, drag.latestClientY);
  }

  function handleStagePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    stageId: string
  ) {
    if (
      savingPlan ||
      (event.button !== undefined && event.button !== 0) ||
      isInteractiveStageTarget(event.target)
    ) {
      return;
    }

    const draft = editingDraftRef.current;
    if (!draft) {
      return;
    }

    const sourceIndex = draft.stages.findIndex((stage) => stage.id === stageId);
    if (sourceIndex < 0) {
      return;
    }

    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const clientX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : 0;
    cancelStagePointerDrag();

    const listeners = {
      move: (pointerEvent: PointerEvent) => handleStagePointerMove(pointerEvent),
      up: (pointerEvent: PointerEvent) => finishStagePointerDrag(pointerEvent),
      cancel: (pointerEvent: PointerEvent) => finishStagePointerDrag(pointerEvent, true),
      blur: () => cancelStagePointerDrag()
    };
    const drag: StagePointerDrag = {
      stageId,
      pointerId: event.pointerId,
      startX: clientX,
      startY: clientY,
      offsetX: clientX - bounds.left,
      offsetY: clientY - bounds.top,
      width: bounds.width,
      height: bounds.height,
      active: false,
      insertionIndex: sourceIndex,
      latestClientX: clientX,
      latestClientY: clientY,
      frameRequestId: null,
      dropTargetStageId: null,
      listeners
    };
    stagePointerDragRef.current = drag;
    window.addEventListener("pointermove", listeners.move, { passive: false });
    window.addEventListener("pointerup", listeners.up);
    window.addEventListener("pointercancel", listeners.cancel);
    window.addEventListener("blur", listeners.blur);
  }

  function handleStagePointerMove(event: PointerEvent) {
    const drag = stagePointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const clientX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : 0;
    const hasCoordinates = Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
    const distance = hasCoordinates
      ? Math.hypot(clientX - drag.startX, clientY - drag.startY)
      : Number.POSITIVE_INFINITY;
    if (!drag.active && distance < 6) {
      return;
    }

    if (!drag.active) {
      drag.active = true;
      drag.latestClientX = clientX;
      drag.latestClientY = clientY;
      moveStageDragPreview(drag, clientX, clientY);
      setDraggedStageId(drag.stageId);
      setDropTargetStageId(null);
      setKeyboardGrabbedStageId(null);
      setStageDragPreview({
        stageId: drag.stageId,
        width: drag.width,
        height: drag.height,
        insertionIndex: drag.insertionIndex
      });
      setEditorError(null);
    }

    event.preventDefault();
    drag.latestClientX = clientX;
    drag.latestClientY = clientY;
    scheduleStagePointerFrame(drag);
  }

  function finishStagePointerDrag(event: PointerEvent, cancelled = false) {
    const drag = stagePointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (drag.active && !cancelled) {
      if (Number.isFinite(event.clientX)) {
        drag.latestClientX = event.clientX;
      }
      if (Number.isFinite(event.clientY)) {
        drag.latestClientY = event.clientY;
      }

      flushStagePointerFrame(drag);
      moveStageToIndex(drag.stageId, drag.insertionIndex);
    }

    cancelStagePointerDrag();
  }

  function handleStageHandleKeyDown(
    event: ReactKeyboardEvent<HTMLSpanElement>,
    stageId: string
  ) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const nextGrabbedStageId = keyboardGrabbedStageId === stageId ? null : stageId;
      setKeyboardGrabbedStageId(nextGrabbedStageId);
      setDraggedStageId(nextGrabbedStageId);
      setDropTargetStageId(null);
      setStageDragPreview(null);
      return;
    }

    if (keyboardGrabbedStageId !== stageId) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setKeyboardGrabbedStageId(null);
      setDraggedStageId(null);
      setStageDragPreview(null);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      moveStageInDraft(stageId, event.key === "ArrowUp" ? -1 : 1);
    }
  }

  function requestDeleteStage(stageId: string) {
    const stage = editingDraftRef.current?.stages.find((candidate) => candidate.id === stageId);
    if (!stage) {
      return;
    }

    if (stage.tasks.length > 0) {
      setStageDeleteWarningId(stageId);
      return;
    }

    updateEditingDraft((draft) => {
      const stage = draft.stages.find((candidate) => candidate.id === stageId);
      if (!stage) {
        return draft;
      }

      return {
        ...draft,
        stages: draft.stages.filter((candidate) => candidate.id !== stageId),
        deletedStageIds: stage.isNew
          ? draft.deletedStageIds
          : [...draft.deletedStageIds, stage.id]
      };
    });
  }

  async function saveEditingPlan(planId: string) {
    if (!editingDraft || editingDraft.planId !== planId || savingPlan) {
      return false;
    }

    const validation = validatePlanEditorDraft(editingDraft);
    if (validation) {
      setCollapsedEditorTaskIds([]);
      setCollapsedEditorChecklistTaskIds([]);
      setValidationFieldId(validation.fieldId);
      setEditorError(validation.message);
      return false;
    }

    setSavingPlan(true);
    setEditorError(null);
    try {
      await onSavePlan?.(editingDraft);
      closeEditPlan(planId);
      return true;
    } catch (error) {
      setEditorError(readPlanEditorSaveError(error));
      return false;
    } finally {
      setSavingPlan(false);
    }
  }

  async function confirmSaveFromDialog() {
    if (
      !pendingConfirmation ||
      (pendingConfirmation.action !== "save" &&
        pendingConfirmation.action !== "discard" &&
        pendingConfirmation.action !== "leave")
    ) {
      return;
    }

    const { action, leaveRequestId, planId } = pendingConfirmation;
    setPendingConfirmation(null);
    const saved = await saveEditingPlan(planId);
    if (saved && action === "leave" && leaveRequestId !== undefined) {
      onResolveLeaveRequest?.(leaveRequestId, "save");
    }
  }

  function confirmDiscardEditPlan() {
    if (
      !pendingConfirmation ||
      (pendingConfirmation.action !== "discard" && pendingConfirmation.action !== "leave")
    ) {
      return;
    }

    const { action, leaveRequestId, planId } = pendingConfirmation;
    setPendingConfirmation(null);
    closeEditPlan(planId);
    if (action === "leave" && leaveRequestId !== undefined) {
      onResolveLeaveRequest?.(leaveRequestId, "discard");
    }
  }

  function confirmDeleteFromDialog() {
    if (!pendingConfirmation) {
      return;
    }

    const { action, taskId, checklistItemId } = pendingConfirmation;
    setPendingConfirmation(null);
    if (action === "delete-task" && taskId) {
      removeTaskFromDraft(taskId, true);
    }
    if (action === "delete-checklist-item" && checklistItemId) {
      removeChecklistItemFromDraft(checklistItemId, true);
    }
  }

  return (
    <section className="planner-map stack" aria-label="Plan">
      <ScreenHeader
        title="Plan"
        description="Plans, stages, and nearby work from imported Markdown."
        actions={
          <div className="planner-map__summary" aria-label="Plan summary">
            <span className="planner-map__count">
              <strong>{openPlanCount}</strong>
              <span>open</span>
            </span>
            <span className="planner-map__count">
              <strong>{completedPlanCount}</strong>
              <span>completed</span>
            </span>
            <span className="planner-map__count planner-map__count--archived">
              <strong>{archivedPlanCount}</strong>
              <span>archived</span>
            </span>
          </div>
        }
      />

      <div className="plan-list">
        {visiblePlanFrames.map((planFrame) => {
          const planCollapsed = isPlanCollapsed(planFrame);
          const isEditingPlan = editingPlanId === planFrame.plan.id;
          const planRecommendation = findTask(planFrame, planFrame.recommendedTaskId);
          const planToggleLabel = planCollapsed
            ? planFrame.collapsed
              ? "Show plan"
              : "Expand plan"
            : planFrame.collapsed
              ? "Hide plan"
              : "Collapse plan";

          return (
            <article
              aria-labelledby={`${planFrame.plan.id}-title`}
              className={`plan-frame${planFrame.collapsed ? " plan-frame--collapsed" : ""}${
                planFrame.isCurrent ? " plan-frame--current" : ""
              }${isEditingPlan ? " plan-frame--editing" : ""}`}
              key={planFrame.plan.id}
            >
              <header className="plan-frame__header">
                <div>
                  <p className="stage-frame__status">{planStatusLabel(planFrame)}</p>
                  <h2 id={`${planFrame.plan.id}-title`}>{planFrame.plan.title}</h2>
                </div>
                <div className="plan-frame__meta">
                  <div
                    className="stage-frame__progress"
                    aria-label={`${planFrame.plan.title} progress summary`}
                  >
                    <span>{planFrame.progress.tasksLabel}</span>
                    {planFrame.progress.checklistLabel ? (
                      <span>{planFrame.progress.checklistLabel}</span>
                    ) : null}
                  </div>
                  <div className="plan-frame__actions">
                    {!editingPlanId && planRecommendation ? (
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={`Continue plan ${planFrame.plan.title}`}
                        onClick={() =>
                          onOpenTask(planRecommendation.id, {
                            activate: planRecommendation.status !== "done"
                          })
                        }
                      >
                        Continue plan
                      </Button>
                    ) : null}
                    {!editingPlanId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="planner-map__edit-button"
                        icon={<Pencil aria-hidden="true" />}
                        ref={(button) => {
                          editPlanButtonRefs.current[planFrame.plan.id] = button;
                        }}
                        aria-label={`Edit plan ${planFrame.plan.title}`}
                        title={`Edit plan ${planFrame.plan.title}`}
                        onClick={() => enterEditPlan(planFrame.plan.id)}
                      >
                        Edit plan
                      </Button>
                    ) : null}
                    {!isEditingPlan ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="planner-map__collapse-button"
                        aria-expanded={!planCollapsed}
                        aria-controls={`${planFrame.plan.id}-content`}
                        aria-label={`${planToggleLabel} ${planFrame.plan.title}`}
                        title={`${planToggleLabel} ${planFrame.plan.title}`}
                        onClick={() => togglePlan(planFrame)}
                      >
                        <CollapseChevron direction={planCollapsed ? "down" : "up"} />
                      </Button>
                    ) : null}
                    {planFrame.collapsed && onArchivePlan && !isEditingPlan ? (
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Hide completed plan ${planFrame.plan.title}`}
                        onClick={() => onArchivePlan(planFrame.plan.id)}
                      >
                        Hide
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div
                  className="stage-frame__progress-bar"
                  role="progressbar"
                  aria-label={`${planFrame.plan.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={planFrame.progress.percent}
                >
                  <span style={{ width: `${planFrame.progress.percent}%` }} />
                </div>
              </header>
              {isEditingPlan ? (
                <section
                  className="planner-edit-panel"
                  aria-label={`Editing ${planFrame.plan.title}`}
                >
                  {editingDraft ? (
                    <>
                      <div className="planner-edit-panel__header">
                        <div className="planner-edit-panel__copy">
                          <strong>Edit plan</strong>
                          <p>Changes stay local until you save.</p>
                          <p>Drag a stage card to reorder stages.</p>
                          <p className="planner-edit-panel__status" role="status">
                            {hasUnsavedChanges ? "Unsaved changes" : "No unsaved changes"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={addStageToDraft}
                          disabled={savingPlan}
                        >
                          Add stage
                        </Button>
                      </div>

                      <div className="planner-edit-panel__fields">
                        <TextField
                          id={`planner-edit-plan-title-${planFrame.plan.id}`}
                          label="Plan title"
                          value={editingDraft.title}
                          onChange={(event) => updatePlanTitle(event.target.value)}
                          aria-invalid={
                            validationFieldId ===
                            `planner-edit-plan-title-${planFrame.plan.id}`
                          }
                        />
                      </div>

                      <div className="planner-edit-stage-list" ref={stageListRef}>
                        {editingDraft.stages.length > 0 ? (
                          buildPlanEditorStageListItems(
                            editingDraft.stages,
                            stageDragPreview
                          ).map((item) => {
                            if (item.kind === "placeholder") {
                              return (
                                <div
                                  className="planner-edit-stage__placeholder"
                                  key={`stage-drag-placeholder-${item.stageId}`}
                                  aria-hidden="true"
                                  style={{ height: `${item.height}px` }}
                                />
                              );
                            }

                            const { stage } = item;
                            const sourceFrame = planFrame.stageFrames.find(
                              (frame) => frame.stage.id === stage.id
                            );
                            const taskCount = stage.tasks.length;
                            const stageTitleId = `planner-edit-stage-title-${stage.id}`;
                            const stageDescriptionId = `planner-edit-stage-description-${stage.id}`;

                            const isKeyboardDragged =
                              draggedStageId === stage.id || keyboardGrabbedStageId === stage.id;
                            const isPointerDragged = stageDragPreview?.stageId === stage.id;
                            const isDragged = isKeyboardDragged || isPointerDragged;
                            const isDropTarget = dropTargetStageId === stage.id;

                            return (
                                <article
                                  key={stage.id}
                                  ref={(element) => {
                                    stageCardRefs.current[stage.id] = element;
                                  }}
                                  className={`planner-edit-stage${isDragged ? " planner-edit-stage--dragging" : ""}${
                                    isDropTarget ? " planner-edit-stage--drop-target" : ""
                                  }`}
                                  style={
                                    isPointerDragged
                                      ? {
                                          width: `${stageDragPreview?.width ?? 0}px`
                                        }
                                      : undefined
                                  }
                                  onPointerDown={(event) =>
                                    handleStagePointerDown(event, stage.id)
                                  }
                                >
                                <div className="planner-edit-stage__header">
                                  <div className="planner-edit-stage__identity">
                                    <span
                                      className="planner-edit-stage__drag-handle"
                                      role="button"
                                      tabIndex={0}
                                      aria-label={`Drag stage ${stage.title}`}
                                      aria-roledescription="sortable item"
                                      aria-pressed={keyboardGrabbedStageId === stage.id}
                                      title="Drag to reorder"
                                      onKeyDown={(event) =>
                                        handleStageHandleKeyDown(event, stage.id)
                                      }
                                    >
                                      <GripVertical aria-hidden="true" />
                                    </span>
                                    <div>
                                      <p className="stage-frame__status">
                                        {stage.isNew
                                          ? "New stage"
                                          : stageStatusLabel(sourceFrame?.stage.status ?? "future")}
                                      </p>
                                      <strong>
                                        {taskCount} {pluralize(taskCount, "task")}
                                      </strong>
                                    </div>
                                  </div>
                                  <div className="planner-edit-stage__actions">
                                    <Button
                                      type="button"
                                      variant="danger"
                                      className="planner-edit-stage__delete-button"
                                      icon={<Trash2 aria-hidden="true" />}
                                      aria-label={`Delete stage ${stage.title}`}
                                      title={`Delete stage ${stage.title}`}
                                      disabled={savingPlan}
                                      onClick={() => requestDeleteStage(stage.id)}
                                    >
                                      Delete stage
                                    </Button>
                                  </div>
                                </div>
                                <div className="planner-edit-stage__fields">
                                  <TextField
                                    id={stageTitleId}
                                    label="Stage title"
                                    value={stage.title}
                                    onChange={(event) =>
                                      updateStageDraft(stage.id, (current) => ({
                                        ...current,
                                        title: event.target.value
                                      }))
                                    }
                                    aria-invalid={validationFieldId === stageTitleId}
                                  />
                                  <TextArea
                                    id={stageDescriptionId}
                                    label="Stage description"
                                    value={stage.description}
                                    onChange={(event) =>
                                      updateStageDraft(stage.id, (current) => ({
                                        ...current,
                                        description: event.target.value
                                      }))
                                    }
                                  />
                                </div>
                                <section
                                  className="planner-edit-task-list"
                                  aria-label={`Tasks in ${stage.title}`}
                                >
                                  <header className="planner-edit-task-list__header">
                                    <div>
                                      <h3>Tasks</h3>
                                      <span>
                                        {taskCount} {pluralize(taskCount, "task")}
                                      </span>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      icon={<Plus aria-hidden="true" />}
                                      disabled={savingPlan}
                                      onClick={() => addTaskToDraft(stage.id)}
                                    >
                                      Add task
                                    </Button>
                                  </header>
                                  {stage.tasks.length > 0 ? (
                                    <div className="planner-edit-task-list__items">
                                      {stage.tasks.map((task, taskIndex) => {
                                        const sourceTask = planFrame.stageFrames
                                          .flatMap((frame) => frame.tasks)
                                          .find((candidate) => candidate.id === task.id);
                                        const taskStatus = sourceTask?.status ?? "todo";
                                        const hasPersistedChecklist =
                                          (sourceTask?.checklist.length ?? 0) > 0;
                                        const taskTitleId = `planner-edit-task-title-${task.id}`;
                                        const taskDescriptionId =
                                          `planner-edit-task-description-${task.id}`;
                                        const taskStageId = `planner-edit-task-stage-${task.id}`;
                                        const taskContentId = `planner-edit-task-content-${task.id}`;
                                        const checklistContentId =
                                          `planner-edit-checklist-content-${task.id}`;
                                        const taskCollapsed = isEditorTaskCollapsed(task.id);
                                        const checklistCollapsed = isEditorChecklistCollapsed(task.id);

                                        return (
                                          <article className="planner-edit-task" key={task.id}>
                                            <header className="planner-edit-task__header">
                                              <div className="planner-edit-task__identity">
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  className="planner-edit-disclosure-button"
                                                  aria-expanded={!taskCollapsed}
                                                  aria-controls={taskContentId}
                                                  aria-label={`${taskCollapsed ? "Expand" : "Collapse"} task ${
                                                    task.title || "Untitled task"
                                                  }`}
                                                  title={taskCollapsed ? "Expand task" : "Collapse task"}
                                                  onClick={() => toggleEditorTask(task.id)}
                                                >
                                                  <CollapseChevron
                                                    direction={taskCollapsed ? "down" : "up"}
                                                  />
                                                </Button>
                                                <div className="planner-edit-task__identity-copy">
                                                  <p className="stage-frame__status">
                                                    {task.isNew ? "New task" : "Task"}
                                                  </p>
                                                  <strong>{task.title || "Untitled task"}</strong>
                                                </div>
                                                <TaskStatusBadge status={taskStatus} />
                                              </div>
                                              <div className="planner-edit-structure__actions">
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  className="planner-edit-structure__icon-button"
                                                  icon={<ArrowUp aria-hidden="true" />}
                                                  aria-label={`Move task ${task.title} up`}
                                                  title="Move up"
                                                  disabled={savingPlan || taskIndex === 0}
                                                  onClick={() => moveTaskInDraft(task.id, -1)}
                                                >
                                                  Move up
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  className="planner-edit-structure__icon-button"
                                                  icon={<ArrowDown aria-hidden="true" />}
                                                  aria-label={`Move task ${task.title} down`}
                                                  title="Move down"
                                                  disabled={
                                                    savingPlan || taskIndex === stage.tasks.length - 1
                                                  }
                                                  onClick={() => moveTaskInDraft(task.id, 1)}
                                                >
                                                  Move down
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="danger"
                                                  className="planner-edit-structure__icon-button"
                                                  icon={<Trash2 aria-hidden="true" />}
                                                  aria-label={`Delete task ${task.title}`}
                                                  title={`Delete task ${task.title}`}
                                                  disabled={savingPlan}
                                                  onClick={() =>
                                                    requestDeleteTask(
                                                      task.id,
                                                      hasPersistedChecklist
                                                    )
                                                  }
                                                >
                                                  Delete task
                                                </Button>
                                              </div>
                                            </header>
                                            {taskDeleteWarning?.taskId === task.id ? (
                                              <InlineAlert tone="warning">
                                                {taskDeleteWarning.message}
                                              </InlineAlert>
                                            ) : null}
                                            <div
                                              id={taskContentId}
                                              className="planner-edit-task__content"
                                              hidden={taskCollapsed}
                                            >
                                            <div className="planner-edit-task__fields">
                                              <TextField
                                                id={taskTitleId}
                                                label="Task title"
                                                value={task.title}
                                                disabled={savingPlan}
                                                onChange={(event) =>
                                                  updateTaskDraft(task.id, (current) => ({
                                                    ...current,
                                                    title: event.target.value
                                                  }))
                                                }
                                                aria-invalid={validationFieldId === taskTitleId}
                                              />
                                              <TextArea
                                                id={taskDescriptionId}
                                                label="Task description"
                                                value={task.description}
                                                disabled={savingPlan}
                                                onChange={(event) =>
                                                  updateTaskDraft(task.id, (current) => ({
                                                    ...current,
                                                    description: event.target.value
                                                  }))
                                                }
                                              />
                                              <SelectField
                                                id={taskStageId}
                                                label="Task stage"
                                                value={stage.id}
                                                disabled={savingPlan}
                                                onChange={(event) =>
                                                  moveTaskToStage(task.id, event.target.value)
                                                }
                                              >
                                                {editingDraft.stages.map((candidate) => (
                                                  <option key={candidate.id} value={candidate.id}>
                                                    {candidate.title || "Untitled stage"}
                                                  </option>
                                                ))}
                                              </SelectField>
                                            </div>
                                            <section
                                              className="planner-edit-checklist"
                                              aria-label={`Checklist for ${task.title}`}
                                            >
                                              <header className="planner-edit-checklist__header">
                                                <div className="planner-edit-checklist__identity">
                                                  {task.checklist.length > 0 ? (
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      className="planner-edit-disclosure-button"
                                                      aria-expanded={!checklistCollapsed}
                                                      aria-controls={checklistContentId}
                                                      aria-label={`${
                                                        checklistCollapsed ? "Expand" : "Collapse"
                                                      } checklist for ${task.title || "Untitled task"}`}
                                                      title={
                                                        checklistCollapsed
                                                          ? "Expand checklist"
                                                          : "Collapse checklist"
                                                      }
                                                      onClick={() => toggleEditorChecklist(task.id)}
                                                    >
                                                      <CollapseChevron
                                                        direction={checklistCollapsed ? "down" : "up"}
                                                      />
                                                    </Button>
                                                  ) : null}
                                                  <div>
                                                    <h4>Checklist</h4>
                                                    <span>
                                                      {task.checklist.length}{" "}
                                                      {pluralize(task.checklist.length, "item")}
                                                    </span>
                                                  </div>
                                                </div>
                                                <Button
                                                  type="button"
                                                  variant="secondary"
                                                  icon={<Plus aria-hidden="true" />}
                                                  disabled={savingPlan}
                                                  onClick={() => addChecklistItemToDraft(task.id)}
                                                >
                                                  Add checklist item
                                                </Button>
                                              </header>
                                              {task.checklist.length > 0 ? (
                                                <div
                                                  id={checklistContentId}
                                                  className="planner-edit-checklist__items"
                                                  hidden={checklistCollapsed}
                                                >
                                                  {task.checklist.map((item, itemIndex) => {
                                                    const itemTitleId =
                                                      `planner-edit-checklist-title-${item.id}`;
                                                    const itemDescriptionId =
                                                      `planner-edit-checklist-description-${item.id}`;

                                                    return (
                                                      <article
                                                        className="planner-edit-checklist__item"
                                                        key={item.id}
                                                      >
                                                        <header className="planner-edit-checklist__item-header">
                                                          <p className="stage-frame__status">
                                                            {item.isNew
                                                              ? "New checklist item"
                                                              : "Checklist item"}
                                                          </p>
                                                          <div className="planner-edit-structure__actions">
                                                            <Button
                                                              type="button"
                                                              variant="ghost"
                                                              className="planner-edit-structure__icon-button"
                                                              icon={<ArrowUp aria-hidden="true" />}
                                                              aria-label={`Move checklist item ${item.title} up`}
                                                              title="Move up"
                                                              disabled={savingPlan || itemIndex === 0}
                                                              onClick={() =>
                                                                moveChecklistItemInDraft(item.id, -1)
                                                              }
                                                            >
                                                              Move up
                                                            </Button>
                                                            <Button
                                                              type="button"
                                                              variant="ghost"
                                                              className="planner-edit-structure__icon-button"
                                                              icon={<ArrowDown aria-hidden="true" />}
                                                              aria-label={`Move checklist item ${item.title} down`}
                                                              title="Move down"
                                                              disabled={
                                                                savingPlan ||
                                                                itemIndex === task.checklist.length - 1
                                                              }
                                                              onClick={() =>
                                                                moveChecklistItemInDraft(item.id, 1)
                                                              }
                                                            >
                                                              Move down
                                                            </Button>
                                                            <Button
                                                              type="button"
                                                              variant="danger"
                                                              className="planner-edit-structure__icon-button"
                                                              icon={<Trash2 aria-hidden="true" />}
                                                              aria-label={`Delete checklist item ${item.title}`}
                                                              title={`Delete checklist item ${item.title}`}
                                                              disabled={savingPlan}
                                                              onClick={() =>
                                                                requestDeleteChecklistItem(item.id)
                                                              }
                                                            >
                                                              Delete checklist item
                                                            </Button>
                                                          </div>
                                                        </header>
                                                        <div className="planner-edit-checklist__fields">
                                                          <TextField
                                                            id={itemTitleId}
                                                            label="Checklist item title"
                                                            value={item.title}
                                                            disabled={savingPlan}
                                                            onChange={(event) =>
                                                              updateChecklistItemDraft(
                                                                item.id,
                                                                (current) => ({
                                                                  ...current,
                                                                  title: event.target.value
                                                                })
                                                              )
                                                            }
                                                            aria-invalid={
                                                              validationFieldId === itemTitleId
                                                            }
                                                          />
                                                          <TextArea
                                                            id={itemDescriptionId}
                                                            label="Checklist item description"
                                                            value={item.description}
                                                            disabled={savingPlan}
                                                            onChange={(event) =>
                                                              updateChecklistItemDraft(
                                                                item.id,
                                                                (current) => ({
                                                                  ...current,
                                                                  description: event.target.value
                                                                })
                                                              )
                                                            }
                                                          />
                                                        </div>
                                                      </article>
                                                    );
                                                  })}
                                                </div>
                                              ) : (
                                                <p className="planner-edit-checklist__empty">
                                                  No checklist items yet.
                                                </p>
                                              )}
                                            </section>
                                            </div>
                                          </article>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="planner-edit-task-list__empty">
                                      No tasks in this stage yet.
                                    </p>
                                  )}
                                </section>
                                {stageDeleteWarningId === stage.id ? (
                                  <InlineAlert tone="warning">
                                    Move or remove this stage's tasks before deleting the stage.
                                  </InlineAlert>
                                ) : null}
                                </article>
                            );
                          })
                        ) : (
                          <p className="planner-edit-stage-list__empty">
                            This plan has no stages yet. Add a stage to start structuring the work.
                          </p>
                        )}
                      </div>

                      {editorError ? <InlineAlert tone="error">{editorError}</InlineAlert> : null}

                      <div className="planner-edit-panel__actions">
                        <Button
                          type="button"
                          disabled={!hasUnsavedChanges || savingPlan}
                          onClick={() => requestSaveEditPlan(planFrame.plan.id)}
                        >
                          {savingPlan ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={savingPlan}
                          onClick={() => requestExitEditPlan(planFrame.plan.id)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : null}
                </section>
              ) : null}
              {planCollapsed && !isEditingPlan ? (
                <div
                  id={`${planFrame.plan.id}-content`}
                  className="stage-frame__summary plan-frame__summary"
                >
                  <p>
                    {planFrame.stageFrames.length} {pluralize(planFrame.stageFrames.length, "stage")} ·{" "}
                    {planFrame.progress.tasksLabel}
                    {planFrame.progress.checklistLabel
                      ? ` · ${planFrame.progress.checklistLabel}`
                      : ""}
                  </p>
                  {planFrame.isCurrent && planRecommendation ? (
                    <p className="plan-frame__recommendation">
                      Next: <strong>{planRecommendation.title}</strong>
                      {planRecommendation.nextStep ? ` · ${planRecommendation.nextStep}` : ""}
                    </p>
                  ) : null}
                </div>
              ) : !isEditingPlan ? (
                <div id={`${planFrame.plan.id}-content`} className="stage-list">
                  {planFrame.stageFrames.map((frame) =>
                    renderStageFrame(
                      frame,
                      planFrame,
                      isStageCollapsed(frame),
                      () => toggleStage(frame),
                      onOpenTask
                    )
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {archivedPlanFrames.length > 0 ? (
        <>
          <div className="planner-map__archive-divider" aria-hidden="true" />
          <section className="planner-map__archived" aria-label="Hidden completed plans">
            <header className="planner-map__archived-header">
              <div>
                <p className="stage-frame__status">Out of the main flow</p>
                <h2>Hidden completed plans</h2>
              </div>
              <span>{archivedPlanFrames.length}</span>
            </header>
            <div className="planner-map__archived-list">
              {archivedPlanFrames.map((planFrame) => (
                <article className="planner-map__archived-item" key={planFrame.plan.id}>
                  <div>
                    <strong>{planFrame.plan.title}</strong>
                    <span>
                      {planFrame.progress.tasksLabel}
                      {planFrame.progress.checklistLabel
                        ? ` · ${planFrame.progress.checklistLabel}`
                        : ""}
                    </span>
                  </div>
                  {onRestorePlan ? (
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={`Restore plan ${planFrame.plan.title}`}
                      onClick={() => onRestorePlan(planFrame.plan.id)}
                    >
                      Restore
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
      {pendingConfirmation ? (
        <div className="planner-confirmation-backdrop">
          <section
            className="planner-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="planner-confirmation-title"
            aria-describedby="planner-confirmation-description"
          >
            <h2 id="planner-confirmation-title">
              {pendingConfirmation.action === "save"
                ? "Save plan changes?"
                : pendingConfirmation.action === "discard" || pendingConfirmation.action === "leave"
                  ? "Discard unsaved changes?"
                  : pendingConfirmation.action === "delete-task"
                    ? "Delete task and its checklist?"
                    : "Delete checklist item?"}
            </h2>
            <p id="planner-confirmation-description">
              {pendingConfirmation.action === "save"
                ? "Your local draft will replace the saved plan."
                : pendingConfirmation.action === "discard" || pendingConfirmation.action === "leave"
                  ? "Your saved plan will stay unchanged."
                  : pendingConfirmation.action === "delete-task"
                    ? "This removes the task and its checklist from the local draft. It will be deleted when you save the plan."
                    : "This removes the checklist item from the local draft. It will be deleted when you save the plan."}
            </p>
            <div className="planner-confirmation__actions">
              <Button
                ref={confirmationStayButtonRef}
                type="button"
                variant="secondary"
                onClick={dismissPendingConfirmation}
              >
                {pendingConfirmation.action === "delete-task"
                  ? "Keep task"
                  : pendingConfirmation.action === "delete-checklist-item"
                    ? "Keep item"
                    : "Stay"}
              </Button>
              {pendingConfirmation.action === "discard" || pendingConfirmation.action === "leave" ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={confirmSaveFromDialog}
                >
                  Save changes
                </Button>
              ) : null}
              <Button
                type="button"
                variant={pendingConfirmation.action === "save" ? "primary" : "danger"}
                onClick={
                  pendingConfirmation.action === "save"
                    ? confirmSaveFromDialog
                    : pendingConfirmation.action === "discard" || pendingConfirmation.action === "leave"
                      ? confirmDiscardEditPlan
                      : confirmDeleteFromDialog
                }
              >
                {pendingConfirmation.action === "save"
                  ? "Save changes"
                  : pendingConfirmation.action === "discard" || pendingConfirmation.action === "leave"
                    ? "Discard changes"
                    : pendingConfirmation.action === "delete-task"
                      ? "Delete task"
                      : "Delete item"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function CollapseChevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      className="planner-map__chevron"
      viewBox="0 0 16 10"
      role="img"
      aria-hidden="true"
    >
      <path
        d={direction === "up" ? "M2 8L8 2L14 8" : "M2 2L8 8L14 2"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function toggleId(current: string[], id: string) {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return [...next];
}

function readCurrentPlannerViewState(projectId?: string) {
  if (!projectId || typeof window === "undefined") {
    return { ...DEFAULT_PLANNER_VIEW_STATE };
  }

  try {
    return readPlannerViewState(window.localStorage, projectId);
  } catch {
    return { ...DEFAULT_PLANNER_VIEW_STATE };
  }
}

function persistPlannerViewState(projectId: string | undefined, state: PlannerViewState) {
  if (!projectId || typeof window === "undefined") {
    return;
  }

  try {
    writePlannerViewState(window.localStorage, projectId, state);
  } catch {
    // Local storage is a best-effort UI preference.
  }
}

function buildPlanEditorStageListItems(
  stages: PlanEditorStageDraft[],
  dragPreview: StageDragPreview | null
): PlanEditorStageListItem[] {
  if (!dragPreview) {
    return stages.map((stage) => ({ kind: "stage", stage }));
  }

  const draggedStage = stages.find((stage) => stage.id === dragPreview.stageId);
  if (!draggedStage) {
    return stages.map((stage) => ({ kind: "stage", stage }));
  }

  const remainingStages = stages.filter((stage) => stage.id !== dragPreview.stageId);
  const insertionIndex = Math.max(
    0,
    Math.min(dragPreview.insertionIndex, remainingStages.length)
  );

  return [
    ...remainingStages
      .slice(0, insertionIndex)
      .map((stage) => ({ kind: "stage" as const, stage })),
    {
      kind: "placeholder",
      stageId: dragPreview.stageId,
      height: dragPreview.height
    },
    { kind: "stage", stage: draggedStage },
    ...remainingStages
      .slice(insertionIndex)
      .map((stage) => ({ kind: "stage" as const, stage }))
  ];
}

function makePlanEditorDraft(planFrame: PlanFrame): PlanEditorDraft {
  return {
    planId: planFrame.plan.id,
    title: planFrame.plan.title,
    stages: planFrame.stageFrames.map((frame) => ({
      id: frame.stage.id,
      title: frame.stage.title,
      description: frame.stage.description,
      isNew: false,
      tasks: frame.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        isNew: false,
        checklist: task.checklist.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description ?? "",
          isNew: false
        }))
      }))
    })),
    deletedStageIds: [],
    deletedTaskIds: [],
    confirmedTaskDeletionIds: [],
    deletedChecklistItemIds: [],
    confirmedChecklistItemIds: []
  };
}

function arePlanEditorDraftsEqual(left: PlanEditorDraft, right: PlanEditorDraft) {
  return (
    left.planId === right.planId &&
    left.title === right.title &&
    sameStringLists(left.deletedStageIds, right.deletedStageIds) &&
    sameStringLists(left.deletedTaskIds, right.deletedTaskIds) &&
    sameStringLists(left.confirmedTaskDeletionIds, right.confirmedTaskDeletionIds) &&
    sameStringLists(left.deletedChecklistItemIds, right.deletedChecklistItemIds) &&
    sameStringLists(left.confirmedChecklistItemIds, right.confirmedChecklistItemIds) &&
    left.stages.length === right.stages.length &&
    left.stages.every((stage, index) => {
      const other = right.stages[index];
      return (
        other !== undefined &&
        stage.id === other.id &&
        stage.title === other.title &&
        stage.description === other.description &&
        stage.isNew === other.isNew &&
        stage.tasks.length === other.tasks.length &&
        stage.tasks.every((task, taskIndex) => {
          const otherTask = other.tasks[taskIndex];
          return (
            otherTask !== undefined &&
            task.id === otherTask.id &&
            task.title === otherTask.title &&
            task.description === otherTask.description &&
            task.isNew === otherTask.isNew &&
            task.checklist.length === otherTask.checklist.length &&
            task.checklist.every((item, itemIndex) => {
              const otherItem = otherTask.checklist[itemIndex];
              return (
                otherItem !== undefined &&
                item.id === otherItem.id &&
                item.title === otherItem.title &&
                item.description === otherItem.description &&
                item.isNew === otherItem.isNew
              );
            })
          );
        })
      );
    })
  );
}

function validatePlanEditorDraft(draft: PlanEditorDraft) {
  if (!draft.title.trim()) {
    return {
      fieldId: `planner-edit-plan-title-${draft.planId}`,
      message: "Enter a name before saving."
    };
  }

  const invalidStage = draft.stages.find((stage) => !stage.title.trim());
  if (invalidStage) {
    return {
      fieldId: `planner-edit-stage-title-${invalidStage.id}`,
      message: "Enter a name before saving."
    };
  }

  const invalidTask = draft.stages
    .flatMap((stage) => stage.tasks)
    .find((task) => !task.title.trim());
  if (invalidTask) {
    return {
      fieldId: `planner-edit-task-title-${invalidTask.id}`,
      message: "Enter a name before saving."
    };
  }

  const invalidChecklistItem = draft.stages
    .flatMap((stage) => stage.tasks)
    .flatMap((task) => task.checklist)
    .find((item) => !item.title.trim());
  if (invalidChecklistItem) {
    return {
      fieldId: `planner-edit-checklist-title-${invalidChecklistItem.id}`,
      message: "Enter a name before saving."
    };
  }

  return null;
}

function sameStringLists(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function appendUnique(ids: string[], id: string) {
  return ids.includes(id) ? ids : [...ids, id];
}

function findDraftTask(draft: PlanEditorDraft, taskId: string) {
  return draft.stages
    .flatMap((stage) => stage.tasks)
    .find((task) => task.id === taskId) ?? null;
}

function findDraftChecklistItem(draft: PlanEditorDraft, itemId: string) {
  return draft.stages
    .flatMap((stage) => stage.tasks)
    .flatMap((task) => task.checklist)
    .find((item) => item.id === itemId) ?? null;
}

function readPlanEditorSaveError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return "";
            }
          })();
  const supportedMessage = [
    "Enter a name before saving.",
    "This plan changed while you were editing. Reload it before saving your changes.",
    "Move or remove this stage's tasks before deleting the stage.",
    "This task has work history, notes, Inbox items, or linked commits and can't be deleted. Complete, move, or hide it instead.",
    "This task is still referenced by a Resume Brief and can't be deleted. Complete, move, or hide it instead.",
    "Choose a new active task or clear it before deleting this task."
  ].find((candidate) => message.includes(candidate));

  return supportedMessage ?? "Couldn't save plan changes. Nothing was changed. Try again.";
}

function comparePlanFrames(left: PlanFrame, right: PlanFrame) {
  return (
    Number(right.isCurrent) - Number(left.isCurrent) ||
    Number(left.collapsed) - Number(right.collapsed) ||
    left.plan.position - right.plan.position ||
    left.plan.id.localeCompare(right.plan.id)
  );
}

function planStatusLabel(planFrame: PlanFrame) {
  if (planFrame.isCurrent) {
    return "Current working plan";
  }
  return planFrame.collapsed ? "Completed plan" : "Open plan";
}

function pluralize(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}

function findTask(planFrame: PlanFrame, taskId: string | null) {
  if (!taskId) {
    return null;
  }

  return (
    planFrame.stageFrames
      .flatMap((frame) => frame.tasks)
      .find((task) => task.id === taskId) ?? null
  );
}

function legacyPlanFrames(frames: PlannerFrame[]): PlanFrame[] {
  if (frames.length === 0) {
    return [];
  }

  const progress = sumProgress(frames);
  const recommendedTaskId =
    frames.find((frame) => frame.recommendedTaskId)?.recommendedTaskId ??
    frames.flatMap((frame) => frame.tasks).find((task) => task.status !== "done")?.id ??
    null;
  const collapsed = frames.every((frame) => frame.stage.status === "completed");

  return [
    {
      plan: {
        id: "legacy-plan",
        projectId: frames[0].stage.projectId,
        title: "Imported plan",
        position: 0
      },
      collapsed,
      isCurrent: !collapsed && recommendedTaskId !== null,
      recommendedTaskId,
      stageFrames: frames,
      progress
    }
  ];
}

function renderStageFrame(
  frame: PlannerFrame,
  planFrame: PlanFrame,
  isCollapsed: boolean,
  onToggle: () => void,
  onOpenTask: PlannerProps["onOpenTask"]
) {
  const planRecommendationInStage = planFrame.isCurrent
    ? frame.tasks.some((task) => task.id === planFrame.recommendedTaskId)
      ? planFrame.recommendedTaskId
      : null
    : null;
  const recommendedTaskId = planRecommendationInStage ?? frame.recommendedTaskId;
  const recommendedTask = frame.tasks.find((task) => task.id === recommendedTaskId) ?? null;
  const stageToggleLabel = isCollapsed ? "Expand stage" : "Collapse stage";

  return (
    <article
      aria-labelledby={`${frame.stage.id}-title`}
      className={`stage-frame stage-frame--${frame.stage.status}${isCollapsed ? " stage-frame--collapsed" : ""}`}
      key={frame.stage.id}
    >
      <header className="stage-frame__header">
        <div>
          <p className="stage-frame__status">{stageStatusLabel(frame.stage.status)}</p>
          <h2 id={`${frame.stage.id}-title`}>{frame.stage.title}</h2>
          {frame.stage.description && !isCollapsed ? (
            <details className="stage-description-details">
              <summary>Stage context</summary>
              <p>{frame.stage.description}</p>
            </details>
          ) : null}
        </div>
        <div
          className="stage-frame__progress"
          aria-label={`${frame.stage.title} progress summary`}
        >
          <span>{frame.progress.tasksLabel}</span>
          {frame.progress.checklistLabel ? <span>{frame.progress.checklistLabel}</span> : null}
        </div>
        <div className="stage-frame__header-actions">
          <Button
            type="button"
            variant="ghost"
            className="planner-map__collapse-button"
            aria-expanded={!isCollapsed}
            aria-controls={`${frame.stage.id}-tasks`}
            aria-label={`${stageToggleLabel} ${frame.stage.title}`}
            title={`${stageToggleLabel} ${frame.stage.title}`}
            onClick={onToggle}
          >
            <CollapseChevron direction={isCollapsed ? "down" : "up"} />
          </Button>
        </div>
        <div
          className="stage-frame__progress-bar"
          role="progressbar"
          aria-label={`${frame.stage.title} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={frame.progress.percent}
        >
          <span style={{ width: `${frame.progress.percent}%` }} />
        </div>
      </header>

      {isCollapsed ? (
        <div id={`${frame.stage.id}-tasks`} className="stage-frame__summary">
          <p>
            {frame.progress.tasksLabel}
            {frame.progress.checklistLabel ? ` · ${frame.progress.checklistLabel}` : ""}
          </p>
          {recommendedTask ? renderCompactTask(recommendedTask, onOpenTask) : null}
        </div>
      ) : (
        <div id={`${frame.stage.id}-tasks`} className="task-list">
          {frame.tasks.map((task) => {
            const isRecommended = planFrame.isCurrent && task.id === recommendedTaskId;
            const completedChecklist = task.checklist.filter((item) => item.completed).length;
            const actionLabel = task.status === "done" ? "Open" : "Continue";

            return (
              <div
                className={`task-row${isRecommended ? " task-row--recommended" : ""}`}
                key={task.id}
              >
                <div className="task-row__content">
                  <div className="task-row__title">
                    <span>{task.title}</span>
                    {isRecommended ? <span className="task-row__next-marker">Next</span> : null}
                    <TaskStatusBadge status={task.status} />
                  </div>
                  {task.nextStep ? <p className="task-row__next-step">Next: {task.nextStep}</p> : null}
                  {task.checklist.length > 0 ? (
                    <small>
                      {completedChecklist}/{task.checklist.length} checklist
                    </small>
                  ) : null}
                  {task.description ? (
                    <details className="task-description-details">
                      <summary>Task details</summary>
                      <p>{task.description}</p>
                    </details>
                  ) : null}
                  <ChecklistDescriptions items={task.checklist} />
                </div>
                <Button
                  variant="secondary"
                  aria-label={`${actionLabel} ${task.title}`}
                  onClick={() =>
                    onOpenTask(task.id, { activate: task.status !== "done" })
                  }
                >
                  {actionLabel}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function renderCompactTask(
  task: Task & { checklist: ChecklistItem[] },
  onOpenTask: PlannerProps["onOpenTask"]
) {
  const actionLabel = task.status === "done" ? "Open" : "Continue";

  return (
    <div className="task-row task-row--summary task-row--recommended">
      <div className="task-row__content">
        <div className="task-row__title">
          <span>{task.title}</span>
          <span className="task-row__next-marker">Next</span>
          <TaskStatusBadge status={task.status} />
        </div>
        {task.nextStep ? <p className="task-row__next-step">Next: {task.nextStep}</p> : null}
      </div>
      <Button
        variant="secondary"
        aria-label={`${actionLabel} ${task.title}`}
        onClick={() => onOpenTask(task.id, { activate: task.status !== "done" })}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

function ChecklistDescriptions({ items }: { items: ChecklistItem[] }) {
  const describedItems = items.filter((item) => item.description);
  if (describedItems.length === 0) {
    return null;
  }

  return (
    <details className="task-checklist__details">
      <summary>Checklist details</summary>
      <ul className="task-checklist__description-list">
        {describedItems.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function stageStatusLabel(status: PlannerFrame["stage"]["status"]) {
  const labels: Record<PlannerFrame["stage"]["status"], string> = {
    completed: "Completed",
    current: "Current",
    future: "Future"
  };

  return labels[status];
}

function sumProgress(frames: PlannerFrame[]): PlanFrame["progress"] {
  const completedTasks = frames.reduce((sum, frame) => sum + frame.progress.completedTasks, 0);
  const totalTasks = frames.reduce((sum, frame) => sum + frame.progress.totalTasks, 0);
  const completedChecklist = frames.reduce(
    (sum, frame) => sum + frame.progress.completedChecklist,
    0
  );
  const totalChecklist = frames.reduce((sum, frame) => sum + frame.progress.totalChecklist, 0);

  return {
    completedTasks,
    totalTasks,
    completedChecklist,
    totalChecklist,
    percent: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
    tasksLabel: `${completedTasks}/${totalTasks} tasks`,
    checklistLabel: totalChecklist > 0 ? `${completedChecklist}/${totalChecklist} checklist` : null
  };
}
