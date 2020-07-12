import {useState, useEffect, default as React} from "react";
import get from "lodash.get";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import * as icons from "@fortawesome/free-solid-svg-icons";

export function Counter({metrics, name, map, ...props}) {
  const [value, setValue] = useState("N/A");
  const [change, setChange] = useState(0);

  useEffect(() => {
    const newValue = get(metrics, name, "N/A");
    if (!Number.isNaN(Number.parseInt(value, 10))) {
      const change = (newValue - value) / value * 100;
      setChange(change.toFixed(0));
    }

    setValue(newValue);
  }, [metrics]);

  const label = get(map, `${name}.label`, name);
  let changeIcon = null;
  let changeColor = "grey";
  if (change > 0) {
    changeColor = "green";
    changeIcon = <FontAwesomeIcon icon={icons.faSortUp} />;
  } else if (change < 0) {
    changeColor = "red";
    changeIcon = <FontAwesomeIcon icon={icons.faSortDown} />;
  }

  return (
    <div css={{padding: "0.5rem", display: "grid", gridTemplateColumns: "20px 160px", gridTemplateRows: "auto", gridTemplateAreas: "'icon label' 'value value' 'change change'", color: "grey", borderLeft: "2px solid grey"}} {...props}>
      <FontAwesomeIcon css={{gridArea: "icon"}} icon={icons["fa" + get(map, `${name}.icon`, "Question")]}/>
      <span css={{gridArea: "label"}}>{label}</span>
      <span css={{gridArea: "value", fontSize: "2.5rem"}}>{value}</span>
      <span css={{gridArea: "change", color: changeColor}}>{changeIcon} {change}%</span>
    </div>
  );
}
