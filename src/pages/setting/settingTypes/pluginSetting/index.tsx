import React from "react";

import { createNativeStackNavigator } from "@react-navigation/native-stack";
import PluginList from "./views/pluginList";
import PluginSort from "./views/pluginSort";
import PluginSubscribe from "./views/pluginSubscribe";
import PluginLibrary from "./views/pluginLibrary";

const Stack = createNativeStackNavigator<any>();

const routes = [
    {
        path: "/pluginsetting/library",
        component: PluginLibrary,
    },
    {
        path: "/pluginsetting/list",
        component: PluginList,
    },
    {
        path: "/pluginsetting/sort",
        component: PluginSort,
    },
    {
        path: "/pluginsetting/subscribe",
        component: PluginSubscribe,
    },
];

export default function PluginSetting() {
    return (
        <Stack.Navigator
            initialRouteName="/pluginsetting/list"
            screenOptions={{
                headerShown: false,
                animation: "slide_from_right",
                animationDuration: 100,
            }}>
            {routes.map(route => (
                <Stack.Screen
                    key={route.path}
                    name={route.path}
                    component={route.component}
                />
            ))}
        </Stack.Navigator>
    );
}
