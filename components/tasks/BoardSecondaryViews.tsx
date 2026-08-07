import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { HTMLTable, InputGroup } from "@blueprintjs/core";
import OwnerAvatar from "@/components/ui/OwnerAvatar";
import { Button } from "@/components/ui/blueprint/Button";
import { statusLabel } from "@/lib/status";
import { relTime } from "@/lib/time";
import type {
  Member,
  TaskModel,
  TaskType,
} from "@/lib/types";
import type { BoardView } from "@/components/tasks/TaskBoardView";

export interface BoardSecondaryViewsProps {
  view: Exclude<BoardView, "board">;
  tasks: TaskModel[];
  types: TaskType[];
  members: Member[];
  onCreateType(name: string): Promise<string>;
  onPatchType(id: string, patch: Partial<TaskType>): Promise<void>;
  onDeleteType(type: TaskType): Promise<void>;
  onAddMember(name: string): Promise<void>;
  onRemoveMember(member: Member): Promise<void>;
}

interface TypeRowProps {
  taskType: TaskType;
  tasks: TaskModel[];
  onPatchType(id: string, patch: Partial<TaskType>): Promise<void>;
  onDeleteType(type: TaskType): Promise<void>;
}

function TypeRow({
  taskType,
  tasks,
  onPatchType,
  onDeleteType,
}: TypeRowProps) {
  const [description, setDescription] = useState(taskType.description);
  const [position, setPosition] = useState(String(taskType.position));
  const authoritativeTypeRef = useRef(taskType);
  authoritativeTypeRef.current = taskType;
  const typeTasks = tasks.filter((task) => task.typeId === taskType.id);
  const done = typeTasks.filter((task) => task.status === "done").length;

  useEffect(() => {
    setDescription(taskType.description);
    setPosition(String(taskType.position));
  }, [taskType.description, taskType.position]);

  async function commitDescription() {
    if (description === taskType.description) return;
    try {
      await onPatchType(taskType.id, { description });
    } catch {
      setDescription(authoritativeTypeRef.current.description);
    }
  }

  async function commitPosition() {
    const trimmed = position.trim();
    const value = Number(trimmed);
    if (!trimmed || !Number.isFinite(value)) {
      setPosition(String(authoritativeTypeRef.current.position));
      return;
    }
    if (value === taskType.position) return;
    try {
      await onPatchType(taskType.id, { position: value });
    } catch {
      setPosition(String(authoritativeTypeRef.current.position));
    }
  }

  return (
    <tr>
      <td aria-label={taskType.name}>
        <div className="type-cell">
          <span>{taskType.name}</span>
          <Button
            minimal
            small
            intent="danger"
            text="Remove"
            aria-label={`Remove ${taskType.name}`}
            onClick={() => (
              void onDeleteType(taskType).catch(() => undefined)
            )}
          />
        </div>
      </td>
      <td>
        <InputGroup
          size="small"
          aria-label={`Description for ${taskType.name}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => void commitDescription()}
        />
      </td>
      <td>{typeTasks.length}</td>
      <td>
        <div className="type-progress">
          <progress
            aria-label={`${taskType.name} progress`}
            value={done}
            max={Math.max(typeTasks.length, 1)}
          />
          <span>{done} / {typeTasks.length}</span>
        </div>
      </td>
      <td>
        <InputGroup
          size="small"
          type="number"
          style={{ width: 76 }}
          aria-label={`Position for ${taskType.name}`}
          value={position}
          onChange={(event) => setPosition(event.target.value)}
          onBlur={() => void commitPosition()}
        />
      </td>
    </tr>
  );
}

export default function BoardSecondaryViews({
  view,
  tasks,
  types,
  members,
  onCreateType,
  onPatchType,
  onDeleteType,
  onAddMember,
  onRemoveMember,
}: BoardSecondaryViewsProps) {
  const [newType, setNewType] = useState("");
  const [newMember, setNewMember] = useState("");
  const [pending, setPending] = useState(false);
  const [memberRemovalPending, setMemberRemovalPending] = useState(false);
  const memberRemovalPendingRef = useRef(false);
  const typeMap = useMemo(
    () => new Map(types.map((type) => [type.id, type])),
    [types],
  );

  async function createType() {
    const name = newType.trim();
    if (!name || pending) return;
    setPending(true);
    try {
      await onCreateType(name);
      setNewType("");
    } catch {
      // Board owns the stable mutation banner.
    } finally {
      setPending(false);
    }
  }

  async function addMember() {
    const name = newMember.trim();
    if (!name || pending) return;
    setPending(true);
    try {
      await onAddMember(name);
      setNewMember("");
    } catch {
      // Board owns the stable mutation banner.
    } finally {
      setPending(false);
    }
  }

  async function removeMember(member: Member) {
    if (memberRemovalPendingRef.current) return;
    memberRemovalPendingRef.current = true;
    setMemberRemovalPending(true);
    try {
      await onRemoveMember(member);
    } catch {
      // Board owns the stable mutation banner.
    } finally {
      memberRemovalPendingRef.current = false;
      setMemberRemovalPending(false);
    }
  }

  if (view === "types") {
    return (
      <section className="secondary-view" aria-label="Types">
        <form
          className="secondary-create"
          onSubmit={(event) => {
            event.preventDefault();
            void createType();
          }}
        >
          <label htmlFor="new-type-name">New type name</label>
          <InputGroup
            id="new-type-name"
            value={newType}
            onChange={(event) => setNewType(event.target.value)}
          />
          <Button type="submit" intent="primary" disabled={pending}>
            Add type
          </Button>
        </form>
        <div className="table-scroll board-table-scroll">
          <HTMLTable
            compact
            interactive
            bordered
            className="board-table types-table"
          >
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Description</th>
                <th scope="col">Task count</th>
                <th scope="col">Progress</th>
                <th scope="col">Position</th>
              </tr>
            </thead>
            <tbody>
              {types.length === 0 ? (
                <tr>
                  <td className="board-empty" colSpan={5}>
                    No types yet.
                  </td>
                </tr>
              ) : null}
              {types.map((taskType) => (
                <TypeRow
                  key={taskType.id}
                  taskType={taskType}
                  tasks={tasks}
                  onPatchType={onPatchType}
                  onDeleteType={onDeleteType}
                />
              ))}
            </tbody>
          </HTMLTable>
        </div>
      </section>
    );
  }

  if (view === "ownership") {
    const ownershipRows = tasks.flatMap((task) => {
      const type = typeMap.get(task.typeId ?? "") ?? null;
      const owners = task.owners.length > 0 ? task.owners : [null];
      return owners.map((owner) => ({
        id: `${task.id}:${owner ?? "unowned"}`,
        owner: owner ?? "No owner yet",
        task,
        type,
      }));
    });

    return (
      <section className="secondary-view" aria-label="Ownership">
        <div className="table-scroll board-table-scroll">
          <HTMLTable
            compact
            interactive
            bordered
            className="board-table ownership-table"
          >
            <thead>
              <tr>
                <th scope="col">Owner</th>
                <th scope="col">Task</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {ownershipRows.length === 0 ? (
                <tr>
                  <td className="board-empty" colSpan={5}>
                    No tasks yet.
                  </td>
                </tr>
              ) : null}
              {ownershipRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.owner}</td>
                  <td>
                    <Link href={`/task/${row.task.id}`}>
                      {row.task.title}
                    </Link>
                  </td>
                  <td>{row.type?.name ?? "No type"}</td>
                  <td>{statusLabel(row.task.status)}</td>
                  <td>{relTime(row.task.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        </div>
      </section>
    );
  }

  return (
    <section className="secondary-view team-view" aria-label="Team">
      <form
        className="secondary-create"
        onSubmit={(event) => {
          event.preventDefault();
          void addMember();
        }}
      >
        <label htmlFor="new-member-name">New owner name</label>
        <InputGroup
          id="new-member-name"
          value={newMember}
          onChange={(event) => setNewMember(event.target.value)}
        />
        <Button type="submit" intent="primary" disabled={pending}>
          Add owner
        </Button>
      </form>
      <ul className="team-list">
        {members.length === 0 ? (
          <li className="board-empty">No team members yet.</li>
        ) : null}
        {members.map((member) => (
          <li key={member.id}>
            <OwnerAvatar
              name={member.name}
              initials={member.initials}
              size={30}
            />
            <span>{member.name}</span>
            <Button
              small
              intent="danger"
              aria-label={`Remove ${member.name}`}
              disabled={memberRemovalPending}
              onClick={() => void removeMember(member)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
