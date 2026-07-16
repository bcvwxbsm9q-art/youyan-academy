from typing import List, Dict, Any, Optional, Tuple

# 证书管理模块接口契约（Python .pyi 存根）
# 对应 server.js 中新增的 REST API 路由

class CertificateService:
    def list_certificates(
        self,
        dept: Optional[str] = None,
        status: Optional[str] = None,
        keyword: Optional[str] = None
    ) -> Dict[str, Any]:
        """GET /api/certificates
        返回证书定义列表及统计信息。
        :raises ValueError: 参数格式非法
        """
        ...

    def get_certificate(self, certificate_id: str) -> Dict[str, Any]:
        """GET /api/certificates/:id
        返回单个证书定义详情，含有效/过期/撤销人数统计。
        :raises FileNotFoundError: 证书不存在
        """
        ...

    def create_certificate(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """POST /api/certificates
        创建证书定义，自动校验编号规则与模板存在性。
        :raises ValueError: 必填字段缺失或格式非法
        :raises FileExistsError: 证书名称重复（可选业务校验）
        """
        ...

    def update_certificate(
        self,
        certificate_id: str,
        payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """PUT /api/certificates/:id
        更新证书定义，禁止修改已颁发实例的证书编号。
        :raises FileNotFoundError: 证书不存在
        :raises ValueError: 状态转换非法
        """
        ...

    def delete_certificate(self, certificate_id: str) -> Dict[str, Any]:
        """DELETE /api/certificates/:id
        删除证书定义，若已存在颁发记录则通常禁止删除（业务策略可配置）。
        :raises FileNotFoundError: 证书不存在
        :raises RuntimeError: 存在有效颁发记录，禁止删除
        """
        ...

    def list_templates(self) -> List[Dict[str, Any]]:
        """GET /api/certificates/templates
        返回内置证书模板列表。
        """
        ...

    def issue_certificate(
        self,
        certificate_id: str,
        user_ids: List[str],
        source_type: str = "manual",
        source_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """POST /api/certificates/:id/issue
        手动或自动向指定用户颁发证书，生成唯一证书编号。
        :raises FileNotFoundError: 证书定义不存在
        :raises ValueError: 用户 ID 列表为空或证书已停用
        :raises RuntimeError: 部分用户已持有该证书有效实例（重复发放策略由业务决定）
        """
        ...

    def revoke_certificate(
        self,
        user_certificate_id: str,
        reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """POST /api/user-certificates/:id/revoke
        撤销某一用户证书实例。
        :raises FileNotFoundError: 实例不存在
        :raises ValueError: 实例状态不允许撤销
        """
        ...

    def list_user_certificates(
        self,
        user_id: Optional[str] = None,
        certificate_id: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """GET /api/user-certificates
        查询用户证书实例，支持按用户、证书定义、状态过滤。
        返回字段包含 imageUrl：服务端预生成证书 PNG 图片 URL，可能为 null。
        """
        ...

    def get_user_certificate(self, user_certificate_id: str) -> Dict[str, Any]:
        """GET /api/user-certificates/:id
        返回用户证书实例详情，含渲染所需完整数据。
        返回字段包含 imageUrl：服务端预生成证书 PNG 图片 URL，可能为 null。
        """
        ...

    def auto_issue_on_exam_pass(
        self,
        exam_id: str,
        user_id: str,
        score: float,
        passing_score: float
    ) -> Optional[Dict[str, Any]]:
        """内部调用（由考试提交判分触发）
        若考试关联了证书且成绩 >= 及格分，则自动颁发证书。
        :returns: 颁发结果或 None（未触发）
        """
        ...

# 统一错误码契约（HTTP 状态码 + 业务码）
ERROR_CODES: Dict[str, Tuple[int, str]] = {
    "CERTIFICATE_NOT_FOUND": (404, "证书定义不存在"),
    "USER_CERTIFICATE_NOT_FOUND": (404, "用户证书实例不存在"),
    "TEMPLATE_NOT_FOUND": (404, "证书模板不存在"),
    "INVALID_STATUS": (400, "状态非法"),
    "DUPLICATE_CERTIFICATE": (409, "已存在有效证书实例"),
    "CERTIFICATE_DISABLED": (400, "证书已停用，无法颁发"),
    "INVALID_NUMBER_RULE": (400, "编号规则非法"),
    "MISSING_REQUIRED_FIELD": (422, "必填字段缺失"),
    "DELETE_WITH_ISSUES": (409, "存在颁发记录，禁止删除"),
}
