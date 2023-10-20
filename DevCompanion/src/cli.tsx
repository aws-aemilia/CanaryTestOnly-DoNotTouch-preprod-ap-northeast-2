import React, { useEffect, useState } from "react";
import { Box, render } from "ink";
import SelectInput from "ink-select-input";
import { MyAmplifyClient } from "./MyAmplifyClient";
import { region, stage } from "./config";
import { App } from "@aws-sdk/client-amplify";
import { Text } from "ink";
import { Item } from "ink-select-input/build/SelectInput";

const client = new MyAmplifyClient(stage, region);

const Cli = () => {
  const [apps, setApps] = useState<App[]>([]);
  const [selectedApp, setSelectedApp] = useState<App | null>(null);

  useEffect(() => {
    client.listApps().then((r) => {
      // console.log(r);
      setApps(r.apps);
    });
  }, []);

  const handleSelect = (item: Item<App>) => {
    setSelectedApp(item.value);
  };

  const items = apps
    .map((a) => ({ label: a.name, value: a, key: a.appId }))
    .sort((a, b) => a.label.localeCompare(b.label));

  if (!apps.length) {
    return (
      <Box>
        <Text>No apps to display...</Text>
      </Box>
    );
  }

  return selectedApp ? (
    <AppDetails app={selectedApp} onBack={() => setSelectedApp(null)} />
  ) : (
    <SelectInput items={items} onSelect={handleSelect} />
  );
};

const AppDetails = ({ app, onBack }: { app: App; onBack: () => void }) => {
  const handleSelect = (item: any) => {
    switch (item.value) {
      case "Delete":
        client.deleteApp(app.appId).then((r) => console.log(r));
        break;
      case "Back":
        onBack();
        break;
      default:
        break;
    }
  };

  const items = [
    { label: "Back", value: "Back" },
    { label: "DeletedApp", value: "Delete" },
  ];
  return (
    <Box flexDirection="column">
      <Box>
        <Text>{JSON.stringify(app, undefined, 2)}</Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} />
    </Box>
  );
};

render(<Cli />);
