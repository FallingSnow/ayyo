module.exports = ({env}) => {
  const isDevelopment = env() === "development";
  return {
    presets: [["@babel/preset-env", {
      bugfixes: true,
      targets: "> 2%, not dead"
    }], "@babel/preset-react", "@emotion/babel-preset-css-prop"],
    plugins: ["babel-plugin-root-import"].concat(isDevelopment ? ["react-refresh/babel"] : [])
  };
};
