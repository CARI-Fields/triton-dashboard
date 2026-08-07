"use client";

import {
  Menu as BPMenu,
  MenuItem as BPMenuItem,
  Popover as BPPopover,
} from "@blueprintjs/core";
import type {
  MenuProps,
  MenuItemProps,
  PopoverProps,
} from "@blueprintjs/core";
import type { ReactNode } from "react";

// Re-export Blueprint's components so consumers build dropdowns from one place.
export const Popover = BPPopover;
export const Menu = BPMenu;
export const MenuItem = BPMenuItem;
export type { MenuProps, MenuItemProps, PopoverProps };

export interface ActionMenuItem {
  /** Item text (required for usability). */
  text: ReactNode;
  /** Blueprint icon name rendered before the text. */
  icon?: MenuItemProps["icon"];
  /** Visual intent (e.g. "danger" for destructive actions). */
  intent?: MenuItemProps["intent"];
  /** Click handler invoked when the item is selected. */
  onClick?: MenuItemProps["onClick"];
  /** Right-aligned label text (e.g. a hotkey hint). */
  label?: string;
}

export interface ActionMenuProps {
  /** Actions to render as menu items. */
  items: ActionMenuItem[];
  /** The trigger element (rendered as the Popover target). */
  children: ReactNode;
  /**
   * Called after the menu finishes closing (Escape, outside-click, or item
   * selection). The portal content is unmounted by this point, so it is the
   * right place to restore focus to the trigger.
   */
  onClosed?: PopoverProps["onClosed"];
}

/**
 * Convenience dropdown: a click-triggered, minimal Popover anchored to the
 * bottom-end of its trigger, containing one MenuItem per `items` entry.
 */
export function ActionMenu({
  items,
  children,
  onClosed,
}: ActionMenuProps) {
  return (
    <BPPopover
      interactionKind="click"
      minimal
      placement="bottom-end"
      popoverClassName="bp_menu-overflow"
      canEscapeKeyClose
      enforceFocus={false}
      onClosed={onClosed}
      content={
        <BPMenu>
          {items.map((item, index) => (
            <BPMenuItem
              key={index}
              text={item.text}
              icon={item.icon}
              intent={item.intent}
              onClick={item.onClick}
              label={item.label}
            />
          ))}
        </BPMenu>
      }
    >
      {children}
    </BPPopover>
  );
}
