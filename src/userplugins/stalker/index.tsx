/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Menu } from "@webpack/common";
import { UserContextProps } from "plugins/biggerStreamPreview";

import * as status from "./status";
import * as voice from "./voice";

export const logger = new Logger("Stalker");
export let targets: string[] = [];

const parseTargets = (parse: string): string[] => {
    const regex = /\s*(,?)\s*([0-9]+)/g;
    const matches = [...parse.matchAll(regex)].map(value => {
        return value.at(value.length - 1) as string;
    });

    targets = matches;

    return matches;
};

export const settings = definePluginSettings({
    stalkContext: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Adds an option on the user context menu that enables stalking for users."
    },

    notifyCallJoin: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Send a notification when a user joins a call.",
    },

    notifyOffline: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Send a notification when a user goes offline."
    },

    notifyOnline: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Send a notification when a user goes online.",
    },

    notifyDnd: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Send a notification when a user goes on Do Not Disturb.",
    },

    notifyIdle: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Send a notification when a user goes on idle.",
    },

    notifyGoOnline: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Send a notification when a user logs onto Discord or leaves invisible, regardless of the 4 above options."
    },

    targets: {
        type: OptionType.STRING,
        placeholder: "1234,5678",
        description: "List of user IDs to stalk, separate with a comma.",
        default: "",
        onChange: parseTargets,
    },
});

const patchUserContext: NavContextMenuPatchCallback = (children, { user }: UserContextProps) => {
    if (!settings.store.stalkContext) return;
    if (!user) return;

    const stalked = settings.store.targets.includes(user.id);
    const group = findGroupChildrenByChildId("apps", children) ?? children;
    let id = group.findLastIndex(child => child?.props?.id && child.props.id === "ignore"); // ignore button
    if (id < 0) id = group.length - 1; // or at the end if not found

    group.splice(id, 0,
        <Menu.MenuItem
            id="vc-st-stalk"
            label={stalked ? "Unstalk" : "Stalk"}
            action={() => {
                if (stalked) {
                    settings.store.targets = settings.store.targets.replace(new RegExp(`(,?)(\\s*)(${user.id})`), "");
                } else {
                    settings.store.targets += `,${user.id}`;
                    if (settings.store.targets.startsWith(",")) settings.store.targets = settings.store.targets.slice(1);
                }

                parseTargets(settings.store.targets);
            }}
        />
    );
};

export default definePlugin({
    name: "Stalker",
    "description": "Notifies you whenever a person does something.",
    authors: [{ name: "Reycko", id: 1123725368004726794n }],

    contextMenus: {
        "user-context": patchUserContext,
    },

    start() {
        parseTargets(settings.store.targets);
        status.init();
        voice.init();
    },

    stop() {
        status.deinit();
        voice.deinit();
    },

    settings,
});
