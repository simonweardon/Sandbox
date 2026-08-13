#include "VantageHUD.h"

#include "InteractionProbe.h"
#include "VantageCharacter.h"
#include "VantageGameMode.h"

#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Engine/World.h"

namespace
{
	const FLinearColor Ink(0.92f, 0.95f, 1.f, 1.f);
	const FLinearColor InkDim(0.60f, 0.64f, 0.72f, 1.f);
	const FLinearColor Accent(0.20f, 0.85f, 1.f, 1.f);
	const FLinearColor Warn(1.f, 0.55f, 0.20f, 1.f);
	const FLinearColor Panel(0.f, 0.f, 0.f, 0.45f);
}

void AVantageHUD::DrawHUD()
{
	Super::DrawHUD();

	if (!Canvas)
	{
		return;
	}

	const AVantageGameMode* GameMode = GetWorld() ? GetWorld()->GetAuthGameMode<AVantageGameMode>() : nullptr;
	const AVantageCharacter* Character = Cast<AVantageCharacter>(GetOwningPawn());
	const UInteractionProbe* Probe = Character ? Character->GetInteractionProbe() : nullptr;

	const bool bFocused = Probe && Probe->GetFocusedActor() != nullptr;
	const bool bLocked = Probe && Probe->IsFocusLocked();

	DrawCrosshair(bFocused, bLocked);

	if (bFocused)
	{
		DrawPrompt(Probe->GetFocusedPrompt(), bLocked);
	}

	if (GameMode)
	{
		DrawObjective(GameMode->GetObjectiveText(), GameMode->GetShardsCollected(), GameMode->GetShardsRequired());

		if (GameMode->IsComplete())
		{
			DrawCompletionBanner(GameMode->GetTimeSinceCompletion());
		}
	}
}

void AVantageHUD::DrawCrosshair(bool bFocused, bool bLocked)
{
	const float CentreX = Canvas->SizeX * 0.5f;
	const float CentreY = Canvas->SizeY * 0.5f;

	const FLinearColor Colour = bLocked ? Warn : (bFocused ? Accent : InkDim);

	// A dot, plus four ticks that spread apart when something is focused.
	const float Gap = bFocused ? 9.f : 5.f;
	const float Length = bFocused ? 7.f : 4.f;
	const float Thickness = 2.f;

	DrawRect(Colour, CentreX - 1.f, CentreY - 1.f, 2.f, 2.f);

	DrawRect(Colour, CentreX - Thickness * 0.5f, CentreY - Gap - Length, Thickness, Length);
	DrawRect(Colour, CentreX - Thickness * 0.5f, CentreY + Gap, Thickness, Length);
	DrawRect(Colour, CentreX - Gap - Length, CentreY - Thickness * 0.5f, Length, Thickness);
	DrawRect(Colour, CentreX + Gap, CentreY - Thickness * 0.5f, Length, Thickness);
}

void AVantageHUD::DrawPrompt(const FText& Prompt, bool bLocked)
{
	const FString Text = Prompt.ToString();
	if (Text.IsEmpty())
	{
		return;
	}

	UFont* Font = GEngine->GetMediumFont();
	const float CentreX = Canvas->SizeX * 0.5f;
	const float Y = Canvas->SizeY * 0.5f + 44.f;

	float Width = 0.f;
	float Height = 0.f;
	GetTextSize(Text, Width, Height, Font, 1.f);

	DrawRect(Panel, CentreX - Width * 0.5f - 14.f, Y - 7.f, Width + 28.f, Height + 14.f);
	DrawCentredText(Text, bLocked ? Warn : Ink, CentreX, Y, Font, 1.f);
}

void AVantageHUD::DrawObjective(const FText& Objective, int32 Collected, int32 Required)
{
	UFont* Font = GEngine->GetMediumFont();
	const float X = 42.f;
	const float Y = 38.f;

	DrawText(Objective.ToString(), Ink, X, Y, Font, 1.f, false);

	// A pip per shard, filled as they are collected.
	const float PipY = Y + 30.f;
	const float PipSize = 14.f;
	const float PipGap = 8.f;

	for (int32 Index = 0; Index < Required; ++Index)
	{
		const float PipX = X + Index * (PipSize + PipGap);
		if (Index < Collected)
		{
			DrawRect(Accent, PipX, PipY, PipSize, PipSize);
		}
		else
		{
			// Hollow: four edges, so an uncollected pip reads as an empty slot.
			DrawRect(InkDim, PipX, PipY, PipSize, 2.f);
			DrawRect(InkDim, PipX, PipY + PipSize - 2.f, PipSize, 2.f);
			DrawRect(InkDim, PipX, PipY, 2.f, PipSize);
			DrawRect(InkDim, PipX + PipSize - 2.f, PipY, 2.f, PipSize);
		}
	}

	DrawText(
		TEXT("WASD move   Shift sprint   Ctrl crouch   Space jump   F light   E interact"),
		InkDim, X, Canvas->SizeY - 46.f, GEngine->GetSmallFont(), 1.f, false);
}

void AVantageHUD::DrawCompletionBanner(float TimeSinceCompletion)
{
	// Fade in over the first second so it does not pop.
	const float Alpha = FMath::Clamp(TimeSinceCompletion, 0.f, 1.f);
	if (Alpha <= 0.f)
	{
		return;
	}

	const float CentreX = Canvas->SizeX * 0.5f;
	const float CentreY = Canvas->SizeY * 0.35f;

	FLinearColor BannerInk = Ink;
	BannerInk.A = Alpha;

	FLinearColor BannerPanel = Panel;
	BannerPanel.A = Panel.A * Alpha;

	DrawRect(BannerPanel, 0.f, CentreY - 24.f, Canvas->SizeX, 96.f);
	DrawCentredText(TEXT("DEMO COMPLETE"), BannerInk, CentreX, CentreY - 8.f, GEngine->GetLargeFont(), 1.6f);

	FLinearColor SubInk = Accent;
	SubInk.A = Alpha;
	DrawCentredText(TEXT("Thanks for playing Vantage"), SubInk, CentreX, CentreY + 40.f, GEngine->GetMediumFont(), 1.f);
}

float AVantageHUD::DrawCentredText(const FString& Text, const FLinearColor& Colour, float CentreX, float Y, UFont* Font, float Scale)
{
	float Width = 0.f;
	float Height = 0.f;
	GetTextSize(Text, Width, Height, Font, Scale);

	DrawText(Text, Colour, CentreX - Width * 0.5f, Y, Font, Scale, false);
	return Width;
}
