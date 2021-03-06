/* eslint-disable no-case-declarations */
/* eslint-disable no-param-reassign */
/* eslint-disable class-methods-use-this */
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

const getComponentName = (refString, components, componentType, node) => {
  const pathParts = refString.split('/');

  let itemNameBase = `${pathParts[pathParts.length - 1]}`;

  if (itemNameBase.endsWith('.yaml')) {
    itemNameBase = itemNameBase.substring(0, itemNameBase.length - 5);
  }

  if (itemNameBase.endsWith('.yml')) {
    itemNameBase = itemNameBase.substring(0, itemNameBase.length - 4);
  }

  let itemName = itemNameBase;

  let i = pathParts.length - 2;
  let namePrefix = '';
  while (components[componentType]
      && components[componentType][itemName]
      && JSON.stringify(components[componentType][itemName]) !== JSON.stringify(node)) {
    namePrefix = `${pathParts[i]}_${namePrefix}`;
    itemName = `${namePrefix}${itemNameBase}`;
    i--;
  }

  return itemName;
};

class Bundler {
  constructor(config) {
    this.config = config;
    this.components = {};
  }

  static get rule() {
    return 'bundler';
  }

  defNameToType(definitionName) {
    switch (definitionName) {
      case 'OpenAPISchema':
        return 'schemas';
      case 'OpenAPIParameter':
        return 'parameters';
      case 'OpenAPIResponse':
        return 'responses';
      case 'OpenAPIExample':
        return 'examples';
      case 'OpenAPIRequestBody':
        return 'requestBodies';
      case 'OpenAPIHeader':
        return 'headers';
      case 'OpenAPISecuritySchema':
        return 'securitySchemes';
      case 'OpenAPILink':
        return 'links';
      case 'OpenAPICallback':
        return 'callbacks';
      default:
        return null;
    }
  }

  any() {
    return {
      onExit: (node, definition, ctx, unresolvedNode) => {
        if (Object.keys(unresolvedNode).indexOf('$ref') !== -1) {
          const componentType = this.defNameToType(definition.name);

          if (!componentType) {
            delete unresolvedNode.$ref;
            Object.assign(unresolvedNode, node);
          } else {
            const itemName = getComponentName(
              unresolvedNode.$ref, this.components, componentType, node,
            );
            const newRef = `#/components/${componentType}/${itemName}`;

            if (!this.components[componentType]) {
              this.components[componentType] = {};
            }

            this.components[componentType][itemName] = node;
            unresolvedNode.$ref = newRef;
          }
        }
      },
    };
  }

  OpenAPIRoot() {
    return {
      onExit: (node, definition, ctx) => {
        if (!node.components) {
          node.components = {};
        }

        if (ctx.result.length > 0) {
          ctx.bundlingResult = null;
          return null;
        }

        Object.keys(this.components).forEach((component) => {
          node.components[component] = node.components[component] ? node.components[component] : {};
          Object.assign(node.components[component], this.components[component]);
        });

        let outputFile;

        if (this.config.output) {
          outputFile = this.config.output;
          const nameParts = outputFile.split('.');
          const ext = nameParts[nameParts.length - 1];

          const outputPath = `${process.cwd()}/${outputFile}`;

          const outputDir = path.dirname(outputPath);
          fs.mkdirSync(outputDir, { recursive: true });

          let fileData = null;

          switch (ext) {
            case 'json':
              fileData = JSON.stringify(node, null, 2);
              break;
            case 'yaml':
            case 'yml':
            default:
              fileData = yaml.safeDump(node);
              break;
          }
          fs.writeFileSync(`${outputPath}`, fileData);
        } else if (this.config.outputObject) {
          ctx.bundlingResult = node;
        } else {
          // default output to stdout, if smbd wants to pipe it
          process.stdout.write(yaml.safeDump(node));
          process.stdout.write('\n');
        }
        return null;
      },
    };
  }
}

module.exports = Bundler;
