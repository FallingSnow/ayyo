export function get(object, path, delimiter = ".") {
  return (Array.isArray(path) ? path : path.split(delimiter)).reduce(
    (k, v) => (k ? k[v] : undefined),
    object
  );
}

export function set(object, path, value, delimiter = ".") {
  path = Array.isArray(path) ? path : path.split(delimiter);
  const finalPath = path.pop();
  let finalObj = path.reduce((k, v) => k[v] || (k[v] = {}), object);
  finalObj[finalPath] = value;
  return object;
}
