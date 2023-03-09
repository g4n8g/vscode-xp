import * as path from 'path';
import * as crc32 from 'crc-32';

export class KbHelper {

	/**
	 * Заменяет новые строки Windows формата на Linux (\r\n -> \n)
	 * @param text входная строка
	 * @returns результирующая строка
	 */
	public static convertWindowsEOFToLinux (text : string) : string {
		return text.replace(/(\r\n)/gm, "\n");
	}

	public static getContentSubDirectories(): string[] {
		return ["correlation_rules", "tabular_lists", "aggregation_rules", "enrichment_rules", "normalization_formulas"];
	}

	public static generateRuleObjectId(ruleName : string, contentPrefix : string) : string {
		let objectId = Math.abs(crc32.str(ruleName)).toString();
		objectId = objectId.substring(0, 9);
		return `${contentPrefix}-CR-${objectId}`;
	}

	public static generatePackageObjectId(ruleName : string, contentPrefix : string) : string {
		let objectId = Math.abs(crc32.str(ruleName)).toString();
		objectId = objectId.substring(0, 9);
		return `${contentPrefix}-PKG-${objectId}`;
	}
}