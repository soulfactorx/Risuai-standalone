import { RisuAccessClient } from "./process/mcp/risuaccess";
import { getPrompt } from "./prompts/customPrompts";

/**
 * Iris 도우미의 시스템 프롬프트를 만든다.
 * 프롬프트 본문은 설정 → 프롬프트 관리(irisSystem)에서 바꿀 수 있으며,
 * 기본값은 src/ts/prompts/irisDefault.ts 에 있다.
 */
export const getIrisSystemPrompt = async () => {
    const template = getPrompt("irisSystem")
    const client = new RisuAccessClient()
    // 필요한 경우에만 도구 목록을 계산한다.
    const mcpInstructions = template.includes("{{mcp_instructions}}") ? client.serverInfo.instructions : ""
    const toolList = template.includes("{{tool_list}}") ? JSON.stringify(await client.getToolList()) : ""
    return template
        .split("{{mcp_instructions}}").join(mcpInstructions)
        .split("{{tool_list}}").join(toolList)
}
