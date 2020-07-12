import {default as React, useEffect, useState} from "react";
import {render} from "react-dom";
import {ResponsiveSankey} from "@nivo/sankey";
import {ResponsivePie} from "@nivo/pie";
import {ResponsiveBar} from "@nivo/bar";

import {Counter} from "~/src/components";

const RequestChainGraph = ({data}) => {
  const dataPoints = {
    nodes: Object.keys(data).map(code => ({id: code.toString()})),
    links: [
      {
        source: "200",
        target: "300",
        value: 5
      }
    ]
  };

  return <ResponsiveSankey
    data={dataPoints}
    margin={{top: 40, right: 160, bottom: 40, left: 50}}
    align="justify"
    colors={{scheme: "category10"}}
    nodeOpacity={1}
    nodeThickness={18}
    nodeInnerPadding={3}
    nodeSpacing={24}
    nodeBorderWidth={0}
    nodeBorderColor={{from: "color", modifiers: [["darker", 0.8]]}}
    linkOpacity={0.5}
    linkHoverOthersOpacity={0.1}
    enableLinkGradient={true}
    labelPosition="outside"
    labelOrientation="vertical"
    labelPadding={16}
    labelTextColor={{from: "color", modifiers: [["darker", 1]]}}
    animate={true}
    motionStiffness={140}
    motionDamping={13}
    legends={[
      {
        anchor: "bottom-right",
        direction: "column",
        translateX: 130,
        itemWidth: 100,
        itemHeight: 14,
        itemDirection: "right-to-left",
        itemsSpacing: 2,
        itemTextColor: "#999",
        symbolSize: 14,
        effects: [
          {
            on: "hover",
            style: {
              itemTextColor: "#000"
            }
          }
        ]
      }
    ]}
  />;
};

function OSBrowser({metrics, metricsMap}) {
  // Const keys = metrics.requests.os

  return <ResponsiveBar
    data={[{
      os: "Linux",
      chrome: 59
    }]}
    keys={["chrome"]}
    indexBy="os"
    margin={{top: 50, right: 130, bottom: 50, left: 60}}
    padding={0.3}
    layout="horizontal"
    colors={{scheme: "nivo"}}
    borderColor={{from: "color", modifiers: [["darker", 1.6]]}}
    axisTop={null}
    axisRight={null}
    axisBottom={{
      tickSize: 5,
      tickPadding: 5,
      tickRotation: 0,
      legend: "Requests",
      legendPosition: "middle",
      legendOffset: 32
    }}
    axisLeft={{
      tickSize: 5,
      tickPadding: 5,
      tickRotation: 0,
      legend: "OS",
      legendPosition: "middle",
      legendOffset: -40
    }}
    labelSkipWidth={12}
    labelSkipHeight={12}
    labelTextColor={{from: "color", modifiers: [["darker", 1.6]]}}
    legends={[
      {
        dataFrom: "keys",
        anchor: "bottom-right",
        direction: "column",
        justify: false,
        translateX: 120,
        translateY: 0,
        itemsSpacing: 2,
        itemWidth: 100,
        itemHeight: 20,
        itemDirection: "right-to-left",
        itemOpacity: 0.85,
        symbolSize: 20,
        effects: [
          {
            on: "hover",
            style: {
              itemOpacity: 1
            }
          }
        ]
      }
    ]}
    animate={true}
    motionStiffness={90}
    motionDamping={15}
  />;
}

function JSONPretty({json}) {
  if (typeof json === "object") {
    const entries = Object.entries(json).map(([key, value], idx) => {
      return (
        <li key={idx}>
          <pre style={{margin: 0}}>{key}: <JSONPretty json={value} /></pre>
        </li>
      );
    });

    return (<ul style={{listStyleType: "none"}}>{entries}</ul>);
  }

  const css = {};
  if (json === 0) {
    css.color = "grey";
  }

  return (<span style={css}>{JSON.stringify(json)}</span>);
}

function App() {
  return (
    <Dashboard/>
  );
}

function CodesList({metrics}) {
  const dataPoints = Object.entries(metrics.requests.codes).filter(([, value]) => value > 0).map(([code, value]) => ({
    id: code.toString(),
    label: code.toString(),
    sliceLabel: (value / metrics.requests.total * 100).toFixed(0) + "%",
    value
  }));
  return (
    <div style={{height: 500}}>
      <h3>Response Codes ({metrics.requests.total}):</h3>
      <ResponsivePie width={500} height={500} data={dataPoints}
        margin={{top: 40, right: 80, bottom: 80, left: 80}}
        innerRadius={0.5}
        padAngle={0.7}
        cornerRadius={3}
        sliceLabel="sliceLabel"
        colors={{scheme: "nivo"}}
        borderWidth={1}
        borderColor={{from: "color", modifiers: [["darker", 0.2]]}}
        radialLabelsSkipAngle={10}
        radialLabelsTextXOffset={6}
        radialLabelsTextColor="#333333"
        radialLabelsLinkOffset={0}
        radialLabelsLinkDiagonalLength={16}
        radialLabelsLinkHorizontalLength={24}
        radialLabelsLinkStrokeWidth={1}
        radialLabelsLinkColor={{from: "color"}}
        slicesLabelsSkipAngle={10}
        slicesLabelsTextColor="#333333"
        animate={true}
        motionStiffness={90}
        motionDamping={15}
        legends={[
          {
            anchor: "bottom",
            direction: "row",
            translateY: 56,
            itemWidth: 100,
            itemHeight: 18,
            itemTextColor: "#999",
            symbolSize: 18,
            symbolShape: "circle",
            effects: [
              {
                on: "hover",
                style: {
                  itemTextColor: "#000"
                }
              }
            ]
          }
        ]} />
    </div>
  );
}

function Latency({metrics}) {
  return <h3>Latency ({metrics.requests.total}):</h3>;
}

function Dashboard() {
  const [evtSource, setEvtSource] = useState();
  const [metrics, setMetrics] = useState();
  const [metricsMap, setMetricsMap] = useState({});
  useEffect(() => {
    const source = new EventSource("../events");
    setEvtSource(source);
    source.addEventListener("metrics", ({data}) => {
      const metrics = JSON.parse(data);
      setMetrics(metrics);
    });
    fetch("metricsMap.json").then(r => r.json()).then(setMetricsMap);
  }, []);

  if (!metrics) {
    return <h1>Loading...</h1>;
  }

  return (
    <div css={{fontFamily: "Raleway", padding: "1rem"}}>
      <Counter metrics={metrics} name="requests.total" map={metricsMap} />
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", placeItems: "center start"}}>
        <CodesList metrics={metrics}/>
        <Latency metrics={metrics}/>
      </div>
      <JSONPretty json={metrics}/>
    </div>
  );
}

window.addEventListener("load", () => {
  const root = document.createElement("div");
  document.body.append(root);
  render(<App />, root);
});
