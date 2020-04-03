import * as t from "../types";
import * as path from "path";
import {parse} from "url";

const IS_URL_ABSOLUTE_REGEX = /^https?:\/\//i;

const linkTags = {
  a: true,
  "amplify-card": true,
  "docs-card": true,
  "docs-internal-link-button": true,
  "docs-in-page-link": true,
};

const validLinkExtensions = {
  svg: true,
  jpg: true,
  jpeg: true,
  png: true,
  gif: true,
  md: true,
};

const getRoute = (
  url: string,
  transformerProps: t.TransformerProps,
): string => {
  const {path: urlPath, hash} = parse(url);

  if (urlPath) {
    try {
      const pathDeduction = transformerProps.ctx.resolvePathDeduction(
        urlPath,
        transformerProps.srcPath,
      );
      if (pathDeduction.route) {
        return `${pathDeduction.route}${hash || ""}`;
      } else if (pathDeduction.destinationPath) {
        const pieces = path
          .relative(
            transformerProps.ctx.config.outDir,
            pathDeduction.destinationPath,
          )
          .split(path.sep);
        pieces.shift();
        pieces.shift();
        return `/${pieces.join(path.sep)}`;
      }
    } catch (e) {
      console.log("\x1b[33m%s\x1b[0m", e.message.split("\n")[0]);
    }
  }
  return "";
};

export const links: t.Transformer = (transformerProps: t.TransformerProps) => {
  const {node, lexicalScope} = transformerProps;

  if (Array.isArray(node) && node[0] && linkTags[node[0]]) {
    const [tagName, props, ...children] = node;
    if (props === undefined || props === null) {
      throw new Error(
        `Encountered "${tagName}" element without required prop \`href\``,
      );
    }

    let url = (props.href || props.url) as string;
    if (url) {
      const isURLExternal = IS_URL_ABSOLUTE_REGEX.test(url);

      if (!isURLExternal) {
        // in page links (hash-only url)
        if (url.startsWith("#")) {
          lexicalScope.update([
            "docs-in-page-link",
            {targetId: url.substr(1)},
            ...children,
          ]);
          return;
        }

        if (url.startsWith("..")) {
          const sub = url.substr(2);
          url = `${sub}${sub.startsWith("/") ? sub : `/${sub}`}`;
        }

        if (!url.startsWith("~")) {
          url = `~${url.startsWith("/") ? "" : "/"}${url}`;
        }

        if (
          (!url.includes(".") ||
            !validLinkExtensions[url.split(".").pop() || ""]) &&
          !url.includes("#")
        ) {
          url = `${url}.md`;
        }
      }

      const route = isURLExternal ? url : getRoute(url, transformerProps);

      let finalTagName = tagName;
      const finalProps: Record<string, unknown> = {...props};

      switch (tagName) {
        case "a": {
          finalTagName = isURLExternal
            ? "amplify-external-link"
            : "docs-internal-link";
          finalProps.href = route;
          break;
        }

        case "docs-card":
        case "amplify-card": {
          finalProps.url = route;

          // to satisfy module redirect requirement
          const urlOverrideForMobileFilter = props[
            "url-override-for-mobile-filter"
          ] as string | undefined;
          if (urlOverrideForMobileFilter) {
            const urlOverrideForMobileFilterIsExternal = IS_URL_ABSOLUTE_REGEX.test(
              urlOverrideForMobileFilter,
            );
            const routeOverrideForMobileFilter = urlOverrideForMobileFilterIsExternal
              ? urlOverrideForMobileFilter
              : getRoute(urlOverrideForMobileFilter, transformerProps);
            if (routeOverrideForMobileFilter) {
              finalProps[
                "url-override-for-mobile-filter"
              ] = routeOverrideForMobileFilter;
            }
          }

          break;
        }

        case "docs-internal-link-button": {
          finalProps.href = route;
          break;
        }
      }

      lexicalScope.update([finalTagName, finalProps, ...children]);
    }
  }
};
