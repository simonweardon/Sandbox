#include "VantageHUD.h"

#include "Revolver.h"
#include "VantageCharacter.h"
#include "VantageGameMode.h"

#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Engine/World.h"

namespace
{
	const FLinearColor Ink     (0.94f, 0.93f, 0.90f, 1.f);
	const FLinearColor InkDim  (0.66f, 0.63f, 0.58f, 1.f);
	const FLinearColor Sand    (0.92f, 0.74f, 0.42f, 1.f);
	const FLinearColor Blood   (0.82f, 0.16f, 0.12f, 1.f);
	const FLinearColor Gold    (1.00f, 0.80f, 0.25f, 1.f);
	const FLinearColor Shadow  (0.f, 0.f, 0.f, 0.55f);
}

void AVantageHUD::DrawHUD()
{
	Super::DrawHUD();

	if (!Canvas)
	{
		return;
	}

	const AVantageGameMode* GameMode = GetWorld() ? GetWorld()->GetAuthGameMode<AVantageGameMode>() : nullptr;
	const AVantageCharacter* Player = Cast<AVantageCharacter>(GetOwningPawn());
	const ARevolver* Revolver = Player ? Player->GetRevolver() : nullptr;

	if (Player)
	{
		DrawDamageVignette(Player->GetDamageFlash());
	}

	if (!Player || !Player->IsDown())
	{
		DrawCrosshair(Revolver);
	}

	if (Player)
	{
		DrawHitMarker(Player);
		DrawHealth(Player);
	}

	DrawAmmo(Revolver);
	DrawRunState(GameMode);

	if (Player && Player->IsDown())
	{
		DrawDownBanner();
	}
}

void AVantageHUD::DrawCrosshair(const ARevolver* Revolver)
{
	const float CentreX = Canvas->SizeX * 0.5f;
	const float CentreY = Canvas->SizeY * 0.5f;

	// The crosshair opens up while reloading, which is the clearest possible
	// signal that the gun is not ready without reading any text.
	const float Reloading = Revolver ? (Revolver->IsReloading() ? 1.f : 0.f) : 0.f;
	const float Gap = 6.f + 14.f * Reloading;
	const float Length = 7.f;
	const float Thickness = 2.f;

	const FLinearColor Colour = (Revolver && Revolver->IsEmpty() && !Revolver->IsReloading()) ? Blood : Ink;

	DrawRect(Colour, CentreX - 1.f, CentreY - 1.f, 2.f, 2.f);
	DrawRect(Colour, CentreX - Thickness * 0.5f, CentreY - Gap - Length, Thickness, Length);
	DrawRect(Colour, CentreX - Thickness * 0.5f, CentreY + Gap, Thickness, Length);
	DrawRect(Colour, CentreX - Gap - Length, CentreY - Thickness * 0.5f, Length, Thickness);
	DrawRect(Colour, CentreX + Gap, CentreY - Thickness * 0.5f, Length, Thickness);
}

void AVantageHUD::DrawHitMarker(const AVantageCharacter* Player)
{
	const float Strength = Player->GetHitMarker();
	if (Strength <= 0.f)
	{
		return;
	}

	const float CentreX = Canvas->SizeX * 0.5f;
	const float CentreY = Canvas->SizeY * 0.5f;

	// Gold and larger for a head hit, so the feedback distinguishes the two.
	FLinearColor Colour = Player->WasLastHitHeadshot() ? Gold : Ink;
	Colour.A = Strength;

	const float Inner = Player->WasLastHitHeadshot() ? 13.f : 9.f;
	const float Outer = Inner + 9.f;
	const float Thickness = 2.f;

	// Four diagonal ticks, drawn as short stepped rects since Canvas has no
	// rotated-rect primitive worth the trouble here.
	for (int32 Corner = 0; Corner < 4; ++Corner)
	{
		const float DirX = (Corner & 1) ? 1.f : -1.f;
		const float DirY = (Corner & 2) ? 1.f : -1.f;

		for (float T = Inner; T < Outer; T += Thickness)
		{
			DrawRect(Colour, CentreX + DirX * T, CentreY + DirY * T, Thickness, Thickness);
		}
	}
}

void AVantageHUD::DrawHealth(const AVantageCharacter* Player)
{
	const float BarWidth = 260.f;
	const float BarHeight = 16.f;
	const float X = 44.f;
	const float Y = Canvas->SizeY - 70.f;

	const float Fraction = FMath::Clamp(Player->GetHealth() / FMath::Max(Player->GetMaxHealth(), 1.f), 0.f, 1.f);

	DrawRect(Shadow, X - 3.f, Y - 3.f, BarWidth + 6.f, BarHeight + 6.f);
	DrawRect(FLinearColor(0.16f, 0.13f, 0.11f, 0.9f), X, Y, BarWidth, BarHeight);

	// Bar goes from sand to blood as it empties, so colour alone reads as danger.
	const FLinearColor Fill = FMath::Lerp(Blood, Sand, Fraction);
	DrawRect(Fill, X, Y, BarWidth * Fraction, BarHeight);

	DrawText(FString::Printf(TEXT("%d"), FMath::CeilToInt(Player->GetHealth())),
		Ink, X + BarWidth + 14.f, Y - 3.f, GEngine->GetMediumFont(), 1.f, false);
}

void AVantageHUD::DrawAmmo(const ARevolver* Revolver)
{
	if (!Revolver)
	{
		return;
	}

	const float PipSize = 15.f;
	const float PipGap = 7.f;
	const int32 Capacity = Revolver->GetCapacity();
	const float TotalWidth = Capacity * PipSize + (Capacity - 1) * PipGap;

	const float X = Canvas->SizeX - 44.f - TotalWidth;
	const float Y = Canvas->SizeY - 70.f;

	for (int32 Index = 0; Index < Capacity; ++Index)
	{
		const float PipX = X + Index * (PipSize + PipGap);

		if (Index < Revolver->GetAmmo())
		{
			DrawRect(Sand, PipX, Y, PipSize, PipSize);
		}
		else
		{
			// Hollow: an empty chamber reads as a slot rather than a round.
			DrawRect(InkDim, PipX, Y, PipSize, 2.f);
			DrawRect(InkDim, PipX, Y + PipSize - 2.f, PipSize, 2.f);
			DrawRect(InkDim, PipX, Y, 2.f, PipSize);
			DrawRect(InkDim, PipX + PipSize - 2.f, Y, 2.f, PipSize);
		}
	}

	if (Revolver->IsReloading())
	{
		DrawRect(FLinearColor(0.16f, 0.13f, 0.11f, 0.9f), X, Y + PipSize + 8.f, TotalWidth, 5.f);
		DrawRect(Sand, X, Y + PipSize + 8.f, TotalWidth * Revolver->GetReloadProgress(), 5.f);
	}
	else if (Revolver->IsEmpty())
	{
		DrawText(TEXT("R  RELOAD"), Blood, X, Y + PipSize + 8.f, GEngine->GetSmallFont(), 1.f, false);
	}
}

void AVantageHUD::DrawRunState(const AVantageGameMode* GameMode)
{
	if (!GameMode)
	{
		return;
	}

	UFont* Font = GEngine->GetMediumFont();
	const float X = 44.f;

	DrawText(FString::Printf(TEXT("WAVE %d"), FMath::Max(GameMode->GetWave(), 1)), Sand, X, 38.f, Font, 1.f, false);
	DrawText(FString::Printf(TEXT("Kills  %d"), GameMode->GetKills()), Ink, X, 66.f, Font, 1.f, false);

	if (!GameMode->IsBetweenWaves())
	{
		DrawText(FString::Printf(TEXT("Remaining  %d"), GameMode->GetZombiesAlive()),
			InkDim, X, 92.f, Font, 1.f, false);
	}

	if (GameMode->IsBetweenWaves() && !GameMode->IsPlayerDown())
	{
		const int32 Seconds = FMath::CeilToInt(GameMode->GetSecondsToNextWave());
		const float CentreX = Canvas->SizeX * 0.5f;

		DrawCentredText(FString::Printf(TEXT("WAVE %d INCOMING"), GameMode->GetWave() + 1),
			Sand, CentreX, Canvas->SizeY * 0.22f, GEngine->GetLargeFont(), 1.2f);
		DrawCentredText(FString::Printf(TEXT("%d"), FMath::Max(Seconds, 0)),
			Ink, CentreX, Canvas->SizeY * 0.22f + 42.f, GEngine->GetLargeFont(), 1.6f);
	}

	DrawText(TEXT("WASD move   Shift sprint   LMB fire   R reload   F light   Space jump"),
		InkDim, X, Canvas->SizeY - 40.f, GEngine->GetSmallFont(), 1.f, false);
}

void AVantageHUD::DrawDamageVignette(float Strength)
{
	if (Strength <= 0.f)
	{
		return;
	}

	// Nested translucent borders. Cheap, and at these alphas it reads as a
	// gradient rather than the four bands it actually is.
	const int32 Bands = 5;
	const float MaxThickness = 46.f;

	for (int32 Band = 0; Band < Bands; ++Band)
	{
		const float T = static_cast<float>(Band) / Bands;
		const float Thickness = MaxThickness * (1.f - T);

		FLinearColor Colour = Blood;
		Colour.A = Strength * 0.16f * (1.f - T);

		DrawRect(Colour, 0.f, 0.f, Canvas->SizeX, Thickness);
		DrawRect(Colour, 0.f, Canvas->SizeY - Thickness, Canvas->SizeX, Thickness);
		DrawRect(Colour, 0.f, 0.f, Thickness, Canvas->SizeY);
		DrawRect(Colour, Canvas->SizeX - Thickness, 0.f, Thickness, Canvas->SizeY);
	}
}

void AVantageHUD::DrawDownBanner()
{
	const float CentreX = Canvas->SizeX * 0.5f;
	const float CentreY = Canvas->SizeY * 0.38f;

	DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.55f), 0.f, CentreY - 26.f, Canvas->SizeX, 104.f);
	DrawCentredText(TEXT("YOU ARE DEAD"), Blood, CentreX, CentreY - 10.f, GEngine->GetLargeFont(), 1.8f);
	DrawCentredText(TEXT("Getting back up"), InkDim, CentreX, CentreY + 44.f, GEngine->GetMediumFont(), 1.f);
}

float AVantageHUD::DrawCentredText(const FString& Text, const FLinearColor& Colour, float CentreX, float Y, UFont* Font, float Scale)
{
	float Width = 0.f;
	float Height = 0.f;
	GetTextSize(Text, Width, Height, Font, Scale);

	DrawText(Text, Colour, CentreX - Width * 0.5f, Y, Font, Scale, false);
	return Width;
}
