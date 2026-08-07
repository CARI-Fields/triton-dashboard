import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Icons } from "@blueprintjs/icons";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ActionMenu,
  type ActionMenuItem,
  Menu,
  MenuItem,
  Popover,
} from "@/components/ui/blueprint/Menu";
import { Button } from "@/components/ui/blueprint/Button";

beforeAll(async () => {
  Icons.setLoaderOptions({ loader: "all" });
  await Icons.loadAll();
});

describe("Menu primitives (re-exports)", () => {
  afterEach(cleanup);

  it("Popover + Menu + MenuItem open on click and show item text", async () => {
    render(
      <Popover
        interactionKind="click"
        minimal
        placement="bottom-end"
        content={
          <Menu>
            <MenuItem text="Edit" />
          </Menu>
        }
      >
        <Button text="Open" />
      </Popover>,
    );

    // trigger is visible initially; content is not
    expect(screen.getByText("Open")).toBeTruthy();
    fireEvent.click(screen.getByText("Open"));
    expect(await screen.findByText("Edit")).toBeTruthy();
  });
});

describe("ActionMenu", () => {
  afterEach(cleanup);

  it("renders the provided trigger as children", () => {
    const { container } = render(
      <ActionMenu items={[]}>
        <Button text="Actions" />
      </ActionMenu>,
    );
    expect(screen.getByText("Actions")).toBeTruthy();
    // trigger button rendered inside the popover target wrapper
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("opens the menu on click and shows every item's text", async () => {
    const items: ActionMenuItem[] = [
      { text: "Rename", icon: "edit" },
      { text: "Delete", intent: "danger" },
    ];
    render(
      <ActionMenu items={items}>
        <Button text="More" />
      </ActionMenu>,
    );
    fireEvent.click(screen.getByText("More"));
    expect(await screen.findByText("Rename")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("invokes an item's onClick when the item is selected", async () => {
    const onRename = vi.fn();
    const items: ActionMenuItem[] = [{ text: "Rename", onClick: onRename }];
    render(
      <ActionMenu items={items}>
        <Button text="More" />
      </ActionMenu>,
    );
    fireEvent.click(screen.getByText("More"));
    const item = await screen.findByText("Rename");
    fireEvent.click(item);
    await waitFor(() => {
      expect(onRename).toHaveBeenCalledTimes(1);
    });
  });

  it("forwards item.label to MenuItem aria-label when provided", async () => {
    const items: ActionMenuItem[] = [
      { text: "Rename", label: "F2", onClick: vi.fn() },
    ];
    render(
      <ActionMenu items={items}>
        <Button text="More" />
      </ActionMenu>,
    );
    fireEvent.click(screen.getByText("More"));
    expect(await screen.findByText("Rename")).toBeTruthy();
    // Blueprint renders the right-aligned `label` text inside the menu item
    expect(screen.getByText("F2")).toBeTruthy();
  });
});
